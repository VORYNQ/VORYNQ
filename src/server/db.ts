import "server-only";
import { randomUUID } from "node:crypto";
// Postgres storage (Supabase). Connects through DATABASE_URL, normally Supabase's transaction pooler.
import postgres from "postgres";
import { SCHEMA } from "./schema";
import { DEFAULT_MODEL, estimateCostUsd, isAgentCategoryId, isModelId, isReservedName, isToolId, type AgentCategoryId, type ModelId } from "@/shared/catalog";
import { USAGE_DAYS, type UsageDay } from "@/shared/types";
import type { AccessRequest, AccessStatus, AgentExample, AgentPerformance, KnowledgeDoc, AgentPublic, ApiKeyInfo, DashboardAgent, FranchisableAgent, FranchiseSummary, Job, JobStatus, NetworkStats, OwnerJob, RequestFilters, TreasuryAgent, TreasuryEntry } from "@/shared/types";
import { FRANCHISE, type FranchiseStatus } from "@/shared/franchise";

function connect(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add your Supabase connection string to .env.local.");
  // The transaction pooler (port 6543) does not support prepared statements.
  // Each serverless instance keeps only a few connections; the pooler shares them out.
  return postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
}

// Creates the tables on first use. The advisory lock stops two cold-starting instances racing on CREATE.
async function ensureSchema(conn: postgres.Sql) {
  await conn.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(4207131)`;
    await tx.unsafe(SCHEMA);
  });
}

/** How often a running job proves its process is alive, and how long silence means it died. */
export const JOB_HEARTBEAT_MS = 5_000;
const JOB_STALE_MS = 60_000;

// Next.js can load this module more than once per process (page and API bundles, dev hot reload),
// so keep one connection pool on globalThis and set up the schema only the first time.
const g = globalThis as typeof globalThis & { __vorynqDb?: { sql: postgres.Sql; ready: Promise<void> } };

async function db(): Promise<postgres.Sql> {
  if (!g.__vorynqDb) {
    const sql = connect();
    const ready = ensureSchema(sql).catch((err) => {
      g.__vorynqDb = undefined; // retry on the next request
      throw err;
    });
    g.__vorynqDb = { sql, ready };
  }
  await g.__vorynqDb.ready;
  return g.__vorynqDb.sql;
}

/** Full agent row, including the private fields (instructions, ownership) the server needs. */
export type AgentRecord = Omit<AgentPublic, "isOwner"> & {
  id: string; instructions: string; ownerTokenHash: string; ownerAddress: string | null; webhookUrl: string | null; notifyUrl: string | null;
  dailyJobLimit: number | null; customerDailyLimit: number | null;
  /** Franchises only: the original agent's id, and whether it still exists and is public (so the franchise can run it). */
  parentAgentId: string | null; parentAvailable: boolean;
};

type AgentRow = {
  id: string; slug: string; name: string; description: string; category: string | null; tags: string; instructions: string; tools: string;
  model: string; price_usdc: number; owner_token_hash: string; owner_address: string | null; webhook_url: string | null; notify_url: string | null; api_private: boolean; auto_approve: boolean; is_official: boolean; created_at: string; jobs_completed: number; logo_at: string | null;
  daily_job_limit: number | null; customer_daily_limit: number | null;
  allow_franchise: boolean; franchise_creator_pct: number | null; parent_agent_id: string | null; franchise_status: string | null;
  // The parent agent's public fields, for franchises (null otherwise, or when the parent was deleted).
  p_slug: string | null; p_name: string | null; p_tools: string | null; p_model: string | null; p_category: string | null; p_private: boolean | null;
};

type JobRow = {
  id: string; slug: string; status: string; input: string; output: string | null; error: string | null;
  tools_used: string; input_tokens: number; output_tokens: number; price_usdc: number;
  created_at: string; finished_at: string | null; thread_id: string | null;
};

type OwnerJobRow = JobRow & { agent_name: string; client_address: string | null; owner_note: string | null; reviewed_at: string | null; attempts: number; queued_at: string | null };

/** Error text of a job the owner cancelled; also how a cancelled job is recognised. */
export const JOB_CANCELLED = "Cancelled by the agent owner.";
/** A job can be run at most this many times in total (the first run plus owner re-runs). */
export const JOB_MAX_ATTEMPTS = 5;

const AGENT_SELECT = `
  SELECT a.*, (SELECT COUNT(*)::int FROM jobs j WHERE j.agent_id = a.id AND j.status = 'succeeded') AS jobs_completed,
    (SELECT l.created_at FROM agent_logos l WHERE l.agent_id = a.id) AS logo_at,
    p.slug AS p_slug, p.name AS p_name, p.tools AS p_tools, p.model AS p_model, p.category AS p_category, p.api_private AS p_private
  FROM agents a LEFT JOIN agents p ON p.id = a.parent_agent_id`;

// A franchise shows and runs its parent's model and tools, except send_webhook: that posts to the creator's
// own system, which must not receive the operator's customers' jobs.
const franchiseTools = (tools: string) => (JSON.parse(tools) as unknown[]).filter(isToolId).filter((t) => t !== "send_webhook");

function toAgent(r: AgentRow): AgentRecord {
  const isFranchise = r.parent_agent_id !== null;
  const hasParent = isFranchise && r.p_slug !== null;
  // A franchise whose parent was deleted is closed for good.
  const status = (hasParent ? r.franchise_status ?? "active" : "revoked") as FranchiseStatus;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    category: hasParent && isAgentCategoryId(r.p_category) ? r.p_category : isAgentCategoryId(r.category) ? r.category : null,
    tags: JSON.parse(r.tags) as string[],
    instructions: r.instructions,
    // Agents saved before the switch to DeepSeek may name Claude models or Anthropic-only web tools.
    tools: hasParent ? franchiseTools(r.p_tools!) : (JSON.parse(r.tools) as unknown[]).filter(isToolId),
    model: hasParent && isModelId(r.p_model) ? r.p_model : isModelId(r.model) ? r.model : DEFAULT_MODEL,
    priceUsdc: r.price_usdc,
    ownerTokenHash: r.owner_token_hash,
    ownerAddress: r.owner_address,
    webhookUrl: r.webhook_url,
    notifyUrl: r.notify_url,
    apiPrivate: Boolean(r.api_private),
    autoApprove: Boolean(r.auto_approve),
    official: Boolean(r.is_official),
    createdAt: r.created_at,
    jobsCompleted: Number(r.jobs_completed),
    logoAt: r.logo_at,
    dailyJobLimit: r.daily_job_limit,
    customerDailyLimit: r.customer_daily_limit,
    allowFranchise: Boolean(r.allow_franchise),
    franchiseCreatorPct: r.franchise_creator_pct ?? FRANCHISE.creatorDefaultPct,
    franchise: isFranchise ? { parent: hasParent ? { slug: r.p_slug!, name: r.p_name! } : null, status } : null,
    parentAgentId: r.parent_agent_id,
    parentAvailable: hasParent && !r.p_private,
  };
}

/** Public view of an agent. Pass the signed-in wallet to say whether it owns the agent. (The creator wallet is shown publicly only on the Launcher dashboard.) */
export function toPublic(a: AgentRecord, viewer?: string | null): AgentPublic {
  const { id: _id, instructions: _i, ownerTokenHash: _o, parentAgentId: _p, parentAvailable: _pa, ownerAddress, webhookUrl, notifyUrl, dailyJobLimit, customerDailyLimit, ...pub } = a;
  if (viewer === undefined) return pub;
  const isOwner = Boolean(viewer && ownerAddress === viewer);
  return isOwner ? { ...pub, isOwner, webhookUrl, notifyUrl, dailyJobLimit, customerDailyLimit } : { ...pub, isOwner };
}

/** Editable agent fields (PATCH /api/agents/:slug). */
export type AgentUpdate = Partial<Pick<AgentRecord, "name" | "description" | "category" | "tags" | "instructions" | "tools" | "model" | "priceUsdc" | "webhookUrl" | "notifyUrl" | "apiPrivate" | "autoApprove" | "dailyJobLimit" | "customerDailyLimit">>;

function toJob(r: JobRow): Job {
  return {
    id: r.id,
    agentSlug: r.slug,
    status: r.status as JobStatus,
    input: r.input,
    output: r.output,
    error: r.error,
    toolsUsed: JSON.parse(r.tools_used) as string[],
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    priceUsdc: r.price_usdc,
    paymentStatus: "test",
    createdAt: r.created_at,
    finishedAt: r.finished_at,
    threadId: r.thread_id,
  };
}

function toOwnerJob(r: OwnerJobRow): OwnerJob {
  return { ...toJob(r), agentName: r.agent_name, clientAddress: r.client_address, note: r.owner_note, reviewedAt: r.reviewed_at, attempts: r.attempts, queuedAt: r.queued_at ?? r.created_at };
}

/** Generated agent logos (see logo.ts), kept apart so agent queries never load image bytes. */
export const logos = {
  async get(agentId: string): Promise<{ image: Buffer; contentType: string; createdAt: string } | undefined> {
    const sql = await db();
    const [row] = await sql<{ image: Buffer; content_type: string; created_at: string }[]>`
      SELECT image, content_type, created_at FROM agent_logos WHERE agent_id = ${agentId}`;
    return row && { image: row.image, contentType: row.content_type, createdAt: row.created_at };
  },
  async save(agentId: string, image: Buffer, contentType: string): Promise<string> {
    const sql = await db();
    const createdAt = new Date().toISOString();
    await sql`
      INSERT INTO agent_logos (agent_id, image, content_type, created_at) VALUES (${agentId}, ${image}, ${contentType}, ${createdAt})
      ON CONFLICT (agent_id) DO UPDATE SET image = EXCLUDED.image, content_type = EXCLUDED.content_type, created_at = EXCLUDED.created_at`;
    return createdAt;
  },
};

export const agents = {
  async insert(a: Omit<AgentRecord, "jobsCompleted">, creatorIp: string) {
    const sql = await db();
    await sql`
      INSERT INTO agents (id, slug, name, description, category, tags, instructions, tools, model, price_usdc, owner_token_hash, owner_address, webhook_url, notify_url, creator_ip, created_at,
                          parent_agent_id, franchise_status)
      VALUES (${a.id}, ${a.slug}, ${a.name}, ${a.description}, ${a.category}, ${JSON.stringify(a.tags)}, ${a.instructions},
              ${JSON.stringify(a.tools)}, ${a.model}, ${a.priceUsdc}, ${a.ownerTokenHash}, ${a.ownerAddress}, ${a.webhookUrl}, ${a.notifyUrl}, ${creatorIp}, ${a.createdAt},
              ${a.parentAgentId}, ${a.franchise?.status ?? null})`;
  },
  /** Every agent with its creator wallet and usage: jobs run (any status) and when it was last hired. Most recently used first. */
  async dashboard(limit: number, hideOfficial = false): Promise<DashboardAgent[]> {
    const sql = await db();
    const rows = await sql<{ slug: string; name: string; category: string | null; owner_address: string | null; price_usdc: number; created_at: string; times_used: number; jobs_completed: number; jobs_failed: number; avg_run_seconds: number | null; revenue_usdc: number; last_used_at: string | null; logo_at: string | null }[]>`
      SELECT a.slug, a.name, a.category, a.owner_address, a.price_usdc, a.created_at,
        (SELECT l.created_at FROM agent_logos l WHERE l.agent_id = a.id) AS logo_at,
        COUNT(j.id)::int AS times_used,
        COUNT(j.id) FILTER (WHERE j.status = 'succeeded')::int AS jobs_completed,
        COUNT(j.id) FILTER (WHERE j.status = 'failed' AND j.error IS DISTINCT FROM ${JOB_CANCELLED})::int AS jobs_failed,
        AVG(EXTRACT(EPOCH FROM (j.finished_at::timestamptz - j.queued_at::timestamptz))) FILTER (WHERE j.status = 'succeeded')::float8 AS avg_run_seconds,
        COALESCE(SUM(j.price_usdc) FILTER (WHERE j.status = 'succeeded'), 0)::float8 AS revenue_usdc,
        MAX(j.created_at) AS last_used_at
      FROM agents a LEFT JOIN jobs j ON j.agent_id = a.id
      ${hideOfficial ? sql`WHERE NOT a.is_official` : sql``}
      GROUP BY a.id
      ORDER BY MAX(j.created_at) DESC NULLS LAST, a.created_at DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      category: isAgentCategoryId(r.category) ? r.category : null,
      creator: r.owner_address,
      priceUsdc: r.price_usdc,
      createdAt: r.created_at,
      timesUsed: r.times_used,
      jobsCompleted: r.jobs_completed,
      revenueUsdc: r.revenue_usdc,
      lastUsedAt: r.last_used_at,
      successRate: r.jobs_completed + r.jobs_failed ? r.jobs_completed / (r.jobs_completed + r.jobs_failed) : null,
      avgRunSeconds: r.avg_run_seconds,
      logoAt: r.logo_at,
    }));
  },
  async byOwner(address: string): Promise<AgentRecord[]> {
    const sql = await db();
    return (await sql.unsafe<AgentRow[]>(`${AGENT_SELECT} WHERE a.owner_address = $1 ORDER BY a.created_at DESC`, [address])).map(toAgent);
  },
  /** Gives an unowned (pre-wallet) agent to a wallet. False when it already has an owner. */
  async claim(id: string, address: string): Promise<boolean> {
    const sql = await db();
    return (await sql`UPDATE agents SET owner_address = ${address} WHERE id = ${id} AND owner_address IS NULL RETURNING id`).length > 0;
  },
  async update(id: string, u: AgentUpdate) {
    const sql = await db();
    const cols: Record<string, unknown> = {};
    if (u.name !== undefined) cols.name = u.name;
    if (u.description !== undefined) cols.description = u.description;
    if (u.category !== undefined) cols.category = u.category;
    if (u.tags !== undefined) cols.tags = JSON.stringify(u.tags);
    if (u.instructions !== undefined) cols.instructions = u.instructions;
    if (u.tools !== undefined) cols.tools = JSON.stringify(u.tools);
    if (u.model !== undefined) cols.model = u.model;
    if (u.priceUsdc !== undefined) cols.price_usdc = u.priceUsdc;
    if (u.webhookUrl !== undefined) cols.webhook_url = u.webhookUrl;
    if (u.notifyUrl !== undefined) cols.notify_url = u.notifyUrl;
    if (u.apiPrivate !== undefined) cols.api_private = u.apiPrivate;
    if (u.autoApprove !== undefined) cols.auto_approve = u.autoApprove;
    if (u.dailyJobLimit !== undefined) cols.daily_job_limit = u.dailyJobLimit;
    if (u.customerDailyLimit !== undefined) cols.customer_daily_limit = u.customerDailyLimit;
    if (Object.keys(cols).length) await sql`UPDATE agents SET ${sql(cols)} WHERE id = ${id}`;
  },
  /** Deletes the agent and its job history. Its franchises are closed for good (their own jobs stay with their operators). */
  async remove(id: string) {
    const sql = await db();
    await sql.begin(async (tx) => {
      await tx`UPDATE agents SET franchise_status = 'revoked' WHERE parent_agent_id = ${id}`;
      await tx`DELETE FROM jobs WHERE agent_id = ${id}`;
      await tx`DELETE FROM agents WHERE id = ${id}`;
    });
  },
  async bySlug(slug: string): Promise<AgentRecord | undefined> {
    const sql = await db();
    const [row] = await sql.unsafe<AgentRow[]>(`${AGENT_SELECT} WHERE a.slug = $1`, [slug]);
    return row && toAgent(row);
  },
  async byId(id: string): Promise<AgentRecord | undefined> {
    const sql = await db();
    const [row] = await sql.unsafe<AgentRow[]>(`${AGENT_SELECT} WHERE a.id = $1`, [id]);
    return row && toAgent(row);
  },
  async slugTaken(slug: string): Promise<boolean> {
    const sql = await db();
    return (await sql`SELECT 1 FROM agents WHERE slug = ${slug}`).length > 0;
  },
  /** Whether another agent already uses this name, ignoring case. */
  async nameTaken(name: string, exceptId?: string): Promise<boolean> {
    const sql = await db();
    // Reserved names are closed to everyone, except the official agent keeping its own name when edited.
    if (isReservedName(name)) {
      const [own] = exceptId ? await sql<{ name: string }[]>`SELECT name FROM agents WHERE id = ${exceptId}` : [];
      if (!own || !isReservedName(own.name)) return true;
    }
    return (await sql`SELECT 1 FROM agents WHERE lower(name) = lower(${name}) ${exceptId ? sql`AND id <> ${exceptId}` : sql``}`).length > 0;
  },
  async latest(limit: number, category?: AgentCategoryId): Promise<AgentRecord[]> {
    const sql = await db();
    // Paused and closed franchises take no jobs, so they are left out of the list.
    const open = "(a.parent_agent_id IS NULL OR (p.id IS NOT NULL AND a.franchise_status = 'active'))";
    const rows = category
      ? await sql.unsafe<AgentRow[]>(`${AGENT_SELECT} WHERE COALESCE(p.category, a.category) = $1 AND ${open} ORDER BY a.created_at DESC LIMIT $2`, [category, limit])
      : await sql.unsafe<AgentRow[]>(`${AGENT_SELECT} WHERE ${open} ORDER BY a.created_at DESC LIMIT $1`, [limit]);
    return rows.map(toAgent);
  },
  async countByCreatorSince(sinceIso: string, creatorIp: string): Promise<number> {
    const sql = await db();
    const [row] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM agents WHERE created_at >= ${sinceIso} AND creator_ip = ${creatorIp}`;
    return row.n;
  },
};

const JOB_SELECT = "SELECT j.*, a.slug FROM jobs j JOIN agents a ON a.id = j.agent_id";

// Fails unfinished jobs whose runner has gone quiet (server restarted or crashed mid-job).
// Runs before reads so nobody is shown a job that will never finish.
async function expireStaleJobs(sql: postgres.Sql) {
  const now = Date.now();
  await sql`
    UPDATE jobs SET status = 'failed', error = 'Interrupted: the server stopped working on this job (it may have restarted).',
      finished_at = ${new Date(now).toISOString()}
    WHERE status IN ('queued', 'running') AND COALESCE(heartbeat_at, created_at) < ${new Date(now - JOB_STALE_MS).toISOString()}`;
}

export const jobs = {
  /** clientAddress is the signed-in wallet that hired the agent, if any. */
  /** apiKeyId is the key the job was started with, if any. */
  /** thread is set when the customer can be identified (see threadScope in the jobs route); null for anonymous jobs. */
  /** customerKey says who hired the agent, for the daily caps (see the jobs route). */
  /** split is set on franchise jobs: who gets what of the price (test mode, recorded only). */
  async insert(j: { id: string; agentId: string; input: string; priceUsdc: number; clientIp: string; clientAddress: string | null; apiKeyId: string | null; createdAt: string; thread: { id: string; scope: string } | null; customerKey: string; split?: JobSplit | null }) {
    const sql = await db();
    const s = j.split ?? null;
    await sql`
      INSERT INTO jobs (id, agent_id, status, input, price_usdc, client_ip, client_address, api_key_id, created_at, queued_at, thread_id, thread_scope, customer_key,
                        franchise_parent_id, split_creator_pct, split_operator_pct, split_protocol_pct, split_creator_micro, split_operator_micro, split_protocol_micro,
                        split_creator_address, split_operator_address)
      VALUES (${j.id}, ${j.agentId}, 'queued', ${j.input}, ${j.priceUsdc}, ${j.clientIp}, ${j.clientAddress}, ${j.apiKeyId}, ${j.createdAt}, ${j.createdAt},
              ${j.thread?.id ?? null}, ${j.thread?.scope ?? null}, ${j.customerKey},
              ${s?.parentId ?? null}, ${s?.creatorPct ?? null}, ${s?.operatorPct ?? null}, ${s?.protocolPct ?? null}, ${s?.creator ?? null}, ${s?.operator ?? null}, ${s?.protocol ?? null},
              ${s?.creatorAddress ?? null}, ${s?.operatorAddress ?? null})`;
  },
  /** Runs of every franchise of one agent since `sinceIso`, counted like countForAgentSince. */
  async countForFranchisesSince(parentId: string, sinceIso: string): Promise<number> {
    const sql = await db();
    const [row] = await sql<{ n: number }[]>`
      SELECT COALESCE(SUM(CASE WHEN created_at >= ${sinceIso} THEN attempts ELSE 1 END), 0)::int AS n
      FROM jobs WHERE franchise_parent_id = ${parentId} AND (created_at >= ${sinceIso} OR queued_at >= ${sinceIso})`;
    return row.n;
  },
  /** The split recorded on a job, or undefined for a job that is not a franchise job. */
  async split(id: string): Promise<JobSplit | undefined> {
    const sql = await db();
    const [r] = await sql<{ franchise_parent_id: string; split_creator_pct: number; split_operator_pct: number; split_protocol_pct: number; split_creator_micro: string; split_operator_micro: string; split_protocol_micro: string; split_creator_address: string | null; split_operator_address: string | null }[]>`
      SELECT franchise_parent_id, split_creator_pct, split_operator_pct, split_protocol_pct, split_creator_micro, split_operator_micro, split_protocol_micro,
        split_creator_address, split_operator_address
      FROM jobs WHERE id = ${id} AND franchise_parent_id IS NOT NULL`;
    return r && {
      parentId: r.franchise_parent_id, creatorPct: r.split_creator_pct, operatorPct: r.split_operator_pct, protocolPct: r.split_protocol_pct,
      creator: Number(r.split_creator_micro), operator: Number(r.split_operator_micro), protocol: Number(r.split_protocol_micro),
      creatorAddress: r.split_creator_address, operatorAddress: r.split_operator_address,
    };
  },
  /**
   * The finished exchanges before this job in its conversation, oldest first: what the agent remembers.
   * Only succeeded jobs count, at most `limit` of them.
   */
  async threadHistory(jobId: string, limit: number): Promise<{ input: string; output: string }[]> {
    const sql = await db();
    const rows = await sql<{ input: string; output: string }[]>`
      SELECT p.input, p.output FROM jobs j
      JOIN jobs p ON p.agent_id = j.agent_id AND p.thread_scope = j.thread_scope AND p.thread_id = j.thread_id
      WHERE j.id = ${jobId} AND p.created_at < j.created_at AND p.status = 'succeeded' AND p.output IS NOT NULL
      ORDER BY p.created_at DESC LIMIT ${limit}`;
    return rows.reverse();
  },
  /** Every job of one customer's conversation, oldest first. */
  async thread(agentId: string, scope: string, threadId: string): Promise<Job[]> {
    const sql = await db();
    const rows = await sql.unsafe<JobRow[]>(
      `${JOB_SELECT} WHERE j.agent_id = $1 AND j.thread_scope = $2 AND j.thread_id = $3 ORDER BY j.created_at`, [agentId, scope, threadId]);
    return rows.map(toJob);
  },
  /** Ends a conversation: its jobs stay in the owner's history but are no longer remembered. Returns how many. */
  async forgetThread(agentId: string, scope: string, threadId: string): Promise<number> {
    const sql = await db();
    return (await sql`UPDATE jobs SET thread_id = NULL, thread_scope = NULL WHERE agent_id = ${agentId} AND thread_scope = ${scope} AND thread_id = ${threadId} RETURNING id`).length;
  },
  /**
   * Starts attempt `attempt` of a queued job. False if it is no longer queued (for example the owner cancelled it)
   * or a newer attempt has taken its place.
   */
  async setRunning(id: string, attempt: number): Promise<boolean> {
    const sql = await db();
    return (await sql`UPDATE jobs SET status = 'running', heartbeat_at = ${new Date().toISOString()} WHERE id = ${id} AND status = 'queued' AND attempts = ${attempt} RETURNING id`).length > 0;
  },
  async heartbeat(id: string) {
    const sql = await db();
    await sql`UPDATE jobs SET heartbeat_at = ${new Date().toISOString()} WHERE id = ${id} AND status = 'running'`;
  },
  /** Saves the result of attempt `attempt`. Ignored when that attempt was cancelled or a re-run has replaced it. */
  async finish(id: string, attempt: number, r: { status: "succeeded" | "failed"; output?: string | null; error?: string | null; toolsUsed: string[]; inputTokens: number; outputTokens: number }) {
    const sql = await db();
    await sql`
      UPDATE jobs SET status = ${r.status}, output = ${r.output ?? null}, error = ${r.error ?? null}, tools_used = ${JSON.stringify(r.toolsUsed)},
        input_tokens = ${r.inputTokens}, output_tokens = ${r.outputTokens}, finished_at = ${new Date().toISOString()}
      WHERE id = ${id} AND attempts = ${attempt} AND NOT (status = 'failed' AND error = ${JOB_CANCELLED})`; // a cancelled job keeps its cancellation
  },
  /** Whether attempt `attempt` should stop: the owner cancelled it, or re-ran the job since (a cancel followed by "Run again"). */
  async isSuperseded(id: string, attempt: number): Promise<boolean> {
    const sql = await db();
    return (await sql`SELECT 1 FROM jobs WHERE id = ${id} AND (attempts <> ${attempt} OR (status = 'failed' AND error = ${JOB_CANCELLED}))`).length > 0;
  },
  /** The job's agent, status and attempt count, for owner checks before an action. */
  async meta(id: string): Promise<{ agentId: string; ownerAddress: string | null; status: JobStatus; input: string; attempts: number } | undefined> {
    const sql = await db();
    const [row] = await sql<{ agent_id: string; owner_address: string | null; status: JobStatus; input: string; attempts: number }[]>`
      SELECT j.agent_id, a.owner_address, j.status, j.input, j.attempts FROM jobs j JOIN agents a ON a.id = j.agent_id WHERE j.id = ${id}`;
    return row && { agentId: row.agent_id, ownerAddress: row.owner_address, status: row.status, input: row.input, attempts: row.attempts };
  },
  /** Jobs of every agent the wallet owns, newest first, with the total that match the filters. */
  async forOwner(owner: string, f: RequestFilters, limit: number, offset: number): Promise<{ jobs: OwnerJob[]; total: number }> {
    const sql = await db();
    await expireStaleJobs(sql);
    const like = f.q ? `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const where = sql`
      a.owner_address = ${owner}
      ${f.status ? sql`AND j.status = ${f.status}` : sql``}
      ${f.agent ? sql`AND a.slug = ${f.agent}` : sql``}
      ${like ? sql`AND (j.input ILIKE ${like} OR j.output ILIKE ${like} OR j.owner_note ILIKE ${like})` : sql``}
      ${f.from ? sql`AND j.created_at >= ${f.from}` : sql``}
      ${f.to ? sql`AND j.created_at < ${new Date(Date.parse(`${f.to}T00:00:00Z`) + 86_400_000).toISOString()}` : sql``}
      ${f.reviewed === "yes" ? sql`AND j.reviewed_at IS NOT NULL` : f.reviewed === "no" ? sql`AND j.reviewed_at IS NULL` : sql``}`;
    const [rows, [count]] = await Promise.all([
      sql<OwnerJobRow[]>`
        SELECT j.*, a.slug, a.name AS agent_name FROM jobs j JOIN agents a ON a.id = j.agent_id
        WHERE ${where} ORDER BY j.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM jobs j JOIN agents a ON a.id = j.agent_id WHERE ${where}`,
    ]);
    return { jobs: rows.map(toOwnerJob), total: count.n };
  },
  async setNote(id: string, note: string | null) {
    const sql = await db();
    await sql`UPDATE jobs SET owner_note = ${note} WHERE id = ${id}`;
  },
  async setReviewed(id: string, reviewed: boolean) {
    const sql = await db();
    await sql`UPDATE jobs SET reviewed_at = ${reviewed ? new Date().toISOString() : null} WHERE id = ${id}`;
  },
  /**
   * Puts a failed job back in the queue, keeping its id so the customer's link shows the new result.
   * Returns the new attempt number, or null if it was not failed or has no attempts left.
   */
  async requeue(id: string): Promise<number | null> {
    const sql = await db();
    const now = new Date().toISOString();
    const [row] = await sql<{ attempts: number }[]>`
      UPDATE jobs SET status = 'queued', output = NULL, error = NULL, tools_used = '[]', input_tokens = 0, output_tokens = 0,
        finished_at = NULL, heartbeat_at = ${now}, queued_at = ${now}, reviewed_at = NULL, attempts = attempts + 1
      WHERE id = ${id} AND status = 'failed' AND attempts < ${JOB_MAX_ATTEMPTS} RETURNING attempts`;
    return row?.attempts ?? null;
  },
  /** Stops a queued or running job. The runner notices before its next model call. False if it had already finished. */
  async cancel(id: string): Promise<boolean> {
    const sql = await db();
    const rows = await sql`
      UPDATE jobs SET status = 'failed', error = ${JOB_CANCELLED}, finished_at = ${new Date().toISOString()}
      WHERE id = ${id} AND status IN ('queued', 'running') RETURNING id`;
    return rows.length > 0;
  },
  async byId(id: string): Promise<Job | undefined> {
    const sql = await db();
    await expireStaleJobs(sql);
    const [row] = await sql.unsafe<JobRow[]>(`${JOB_SELECT} WHERE j.id = $1`, [id]);
    return row && toJob(row);
  },
  async forAgent(agentId: string, limit: number): Promise<Job[]> {
    const sql = await db();
    await expireStaleJobs(sql);
    return (await sql.unsafe<JobRow[]>(`${JOB_SELECT} WHERE j.agent_id = $1 ORDER BY j.created_at DESC LIMIT $2`, [agentId, limit])).map(toJob);
  },
  /** Success rate and run times over the last `days` days, plus totals for each of the last 8 weeks. */
  async performance(agentId: string, days = 30): Promise<AgentPerformance> {
    const sql = await db();
    await expireStaleJobs(sql);
    const WEEKS = 8;
    // Monday 00:00 UTC of the week WEEKS-1 weeks before this one.
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
    const firstWeek = new Date(monday.getTime() - (WEEKS - 1) * 7 * 86_400_000);
    const since = new Date(Math.min(firstWeek.getTime(), now.getTime() - days * 86_400_000)).toISOString();
    // Cancelled jobs are the owner's choice, not the agent failing, so they are left out.
    const rows = await sql<{ status: "succeeded" | "failed"; created_at: string; seconds: number }[]>`
      SELECT status, created_at, EXTRACT(EPOCH FROM (finished_at::timestamptz - queued_at::timestamptz))::float8 AS seconds
      FROM jobs WHERE agent_id = ${agentId} AND status IN ('succeeded', 'failed') AND finished_at IS NOT NULL AND created_at >= ${since}
        AND error IS DISTINCT FROM ${JOB_CANCELLED}`;

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const median = (xs: number[]) => {
      if (!xs.length) return null;
      const s = [...xs].sort((a, b) => a - b);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };

    const windowStart = new Date(now.getTime() - days * 86_400_000).toISOString();
    const recent = rows.filter((r) => r.created_at >= windowStart);
    const ok = recent.filter((r) => r.status === "succeeded");
    const failed = recent.length - ok.length;

    const weeks = Array.from({ length: WEEKS }, (_, i) => {
      const start = new Date(firstWeek.getTime() + i * 7 * 86_400_000);
      const end = new Date(start.getTime() + 7 * 86_400_000).toISOString();
      const inWeek = rows.filter((r) => r.created_at >= start.toISOString() && r.created_at < end);
      const weekOk = inWeek.filter((r) => r.status === "succeeded");
      return { weekStart: start.toISOString().slice(0, 10), succeeded: weekOk.length, failed: inWeek.length - weekOk.length, avgRunSeconds: avg(weekOk.map((r) => r.seconds)) };
    });

    return {
      days,
      succeeded: ok.length,
      failed,
      successRate: recent.length ? ok.length / recent.length : null,
      avgRunSeconds: avg(ok.map((r) => r.seconds)),
      medianRunSeconds: median(ok.map((r) => r.seconds)),
      weeks,
    };
  },
  /** Jobs and revenue per UTC day over the last `days` days, for one agent or the whole network. Days without jobs are left out. */
  async dailyUsage(agentId: string | null, days = USAGE_DAYS): Promise<UsageDay[]> {
    const sql = await db();
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const rows = await sql<{ date: string; jobs: number; succeeded: number; revenue: number }[]>`
      SELECT substr(created_at, 1, 10) AS date, COUNT(*)::int AS jobs,
        COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
        COALESCE(SUM(price_usdc) FILTER (WHERE status = 'succeeded'), 0)::float8 AS revenue
      FROM jobs
      WHERE created_at >= ${since} ${agentId ? sql`AND agent_id = ${agentId}` : sql``}
      GROUP BY 1 ORDER BY 1`;
    return rows.map((r) => ({ date: r.date, jobs: r.jobs, succeeded: r.succeeded, revenueUsdc: r.revenue }));
  },
  /**
   * Jobs started since `sinceIso`. Per client IP this counts new jobs only; network-wide it also counts owner re-runs
   * (every attempt of a job created in the window, plus the latest attempt of an older job re-run in it).
   */
  async countSince(sinceIso: string, clientIp?: string): Promise<number> {
    const sql = await db();
    const [row] = clientIp
      ? await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM jobs WHERE created_at >= ${sinceIso} AND client_ip = ${clientIp}`
      : await sql<{ n: number }[]>`
          SELECT COALESCE(SUM(CASE WHEN created_at >= ${sinceIso} THEN attempts ELSE 1 END), 0)::int AS n
          FROM jobs WHERE created_at >= ${sinceIso} OR queued_at >= ${sinceIso}`;
    return row.n;
  },
  /** Runs of one agent since `sinceIso`, counted like the network total (owner re-runs included). */
  async countForAgentSince(agentId: string, sinceIso: string): Promise<number> {
    const sql = await db();
    const [row] = await sql<{ n: number }[]>`
      SELECT COALESCE(SUM(CASE WHEN created_at >= ${sinceIso} THEN attempts ELSE 1 END), 0)::int AS n
      FROM jobs WHERE agent_id = ${agentId} AND (created_at >= ${sinceIso} OR queued_at >= ${sinceIso})`;
    return row.n;
  },
  /** New jobs one customer started since `sinceIso`, on one agent or (without agentId) on all of them. */
  async countForCustomerSince(sinceIso: string, customerKey: string, agentId?: string): Promise<number> {
    const sql = await db();
    const [row] = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM jobs
      WHERE customer_key = ${customerKey} AND created_at >= ${sinceIso} ${agentId ? sql`AND agent_id = ${agentId}` : sql``}`;
    return row.n;
  },
  /** Records the tokens and estimated AI cost of one attempt. Each attempt is recorded once. */
  async addCost(jobId: string, attempt: number, model: ModelId, inputTokens: number, outputTokens: number) {
    const sql = await db();
    await sql`
      INSERT INTO job_costs (job_id, attempt, model, input_tokens, output_tokens, cost_usd, created_at)
      VALUES (${jobId}, ${attempt}, ${model}, ${inputTokens}, ${outputTokens}, ${estimateCostUsd(model, inputTokens, outputTokens)}, ${new Date().toISOString()})
      ON CONFLICT (job_id, attempt) DO NOTHING`;
  },
};

/** Launch-update sign-ups from the footer form. Emails are stored lowercase, once each. */
export const waitlist = {
  async add(email: string, ip: string) {
    const sql = await db();
    await sql`INSERT INTO waitlist (email, ip, created_at) VALUES (${email}, ${ip}, ${new Date().toISOString()}) ON CONFLICT (email) DO NOTHING`;
  },
  async countByIpSince(ip: string, sinceIso: string): Promise<number> {
    const sql = await db();
    const [row] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM waitlist WHERE ip = ${ip} AND created_at >= ${sinceIso}`;
    return row.n;
  },
};

type ApiKeyRow = { id: string; prefix: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null; jobs: number; holder_address: string | null };

const toKeyInfo = (r: ApiKeyRow): ApiKeyInfo => ({
  id: r.id, prefix: r.prefix, label: r.label, createdAt: r.created_at, lastUsedAt: r.last_used_at, revokedAt: r.revoked_at, jobs: r.jobs, holder: r.holder_address,
});
const KEY_SELECT = "SELECT k.id, k.prefix, k.label, k.created_at, k.last_used_at, k.revoked_at, k.holder_address, (SELECT COUNT(*)::int FROM jobs j WHERE j.api_key_id = k.id) AS jobs FROM api_keys k";

export const apiKeys = {
  /** Every key of the agent, newest first, with how many jobs each started. Never includes the key itself. */
  async forAgent(agentId: string): Promise<ApiKeyInfo[]> {
    const sql = await db();
    return (await sql.unsafe<ApiKeyRow[]>(`${KEY_SELECT} WHERE k.agent_id = $1 ORDER BY k.created_at DESC`, [agentId])).map(toKeyInfo);
  },
  /** The active key a requester made for themself, if any. */
  async activeForHolder(agentId: string, holder: string): Promise<ApiKeyInfo | undefined> {
    const sql = await db();
    const [row] = await sql.unsafe<ApiKeyRow[]>(`${KEY_SELECT} WHERE k.agent_id = $1 AND k.holder_address = $2 AND k.revoked_at IS NULL`, [agentId, holder]);
    return row && toKeyInfo(row);
  },
  /** Active keys the owner made. Requesters' keys do not count toward the owner's limit. */
  async countActive(agentId: string): Promise<number> {
    const sql = await db();
    const [row] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM api_keys WHERE agent_id = ${agentId} AND revoked_at IS NULL AND holder_address IS NULL`;
    return row.n;
  },
  async insert(k: { id: string; agentId: string; keyHash: string; prefix: string; label: string; holder?: string }) {
    const sql = await db();
    await sql`
      INSERT INTO api_keys (id, agent_id, key_hash, prefix, label, holder_address, created_at)
      VALUES (${k.id}, ${k.agentId}, ${k.keyHash}, ${k.prefix}, ${k.label}, ${k.holder ?? null}, ${new Date().toISOString()})`;
  },
  /** Revokes every active key a requester made for this agent. */
  async revokeHolder(agentId: string, holder: string) {
    const sql = await db();
    await sql`UPDATE api_keys SET revoked_at = ${new Date().toISOString()} WHERE agent_id = ${agentId} AND holder_address = ${holder} AND revoked_at IS NULL`;
  },
  /** Revokes one of the agent's keys. False if it does not exist or was already revoked. */
  async revoke(agentId: string, id: string): Promise<boolean> {
    const sql = await db();
    const rows = await sql`UPDATE api_keys SET revoked_at = ${new Date().toISOString()} WHERE id = ${id} AND agent_id = ${agentId} AND revoked_at IS NULL RETURNING id`;
    return rows.length > 0;
  },
  /** The active key with this hash for the agent, marking it used; undefined if it is wrong, revoked or belongs to another agent. */
  /** Also says who holds it: the requester's wallet for keys made through access requests, null for owner-made keys. */
  async use(agentId: string, keyHash: string): Promise<{ id: string; holder: string | null } | undefined> {
    const sql = await db();
    const [row] = await sql<{ id: string; holder_address: string | null }[]>`
      UPDATE api_keys SET last_used_at = ${new Date().toISOString()}
      WHERE key_hash = ${keyHash} AND agent_id = ${agentId} AND revoked_at IS NULL RETURNING id, holder_address`;
    return row && { id: row.id, holder: row.holder_address };
  },
};

type ExampleRow = { id: string; input: string; output: string; source_job_id: string | null; created_at: string; updated_at: string };
const toExample = (r: ExampleRow): AgentExample => ({
  id: r.id, input: r.input, output: r.output, sourceJobId: r.source_job_id, createdAt: r.created_at, updatedAt: r.updated_at,
});

export const examples = {
  /** Oldest first, the order they are shown to the model. */
  async forAgent(agentId: string): Promise<AgentExample[]> {
    const sql = await db();
    const rows = await sql<ExampleRow[]>`
      SELECT id, input, output, source_job_id, created_at, updated_at FROM agent_examples WHERE agent_id = ${agentId} ORDER BY created_at`;
    return rows.map(toExample);
  },
  async count(agentId: string): Promise<number> {
    const sql = await db();
    const [row] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM agent_examples WHERE agent_id = ${agentId}`;
    return row.n;
  },
  async insert(agentId: string, e: { input: string; output: string; sourceJobId: string | null }): Promise<AgentExample> {
    const sql = await db();
    const now = new Date().toISOString();
    const [row] = await sql<ExampleRow[]>`
      INSERT INTO agent_examples (id, agent_id, input, output, source_job_id, created_at, updated_at)
      VALUES (${randomUUID()}, ${agentId}, ${e.input}, ${e.output}, ${e.sourceJobId}, ${now}, ${now})
      RETURNING id, input, output, source_job_id, created_at, updated_at`;
    return toExample(row);
  },
  async update(agentId: string, id: string, e: { input: string; output: string }): Promise<AgentExample | undefined> {
    const sql = await db();
    const [row] = await sql<ExampleRow[]>`
      UPDATE agent_examples SET input = ${e.input}, output = ${e.output}, updated_at = ${new Date().toISOString()}
      WHERE id = ${id} AND agent_id = ${agentId}
      RETURNING id, input, output, source_job_id, created_at, updated_at`;
    return row && toExample(row);
  },
  async remove(agentId: string, id: string): Promise<boolean> {
    const sql = await db();
    return (await sql`DELETE FROM agent_examples WHERE id = ${id} AND agent_id = ${agentId} RETURNING id`).length > 0;
  },
};

type DocRow = { id: string; title: string; chars: number; chunks: number; searchable: boolean; created_at: string; updated_at: string };
const toDoc = (r: DocRow): KnowledgeDoc => ({
  id: r.id, title: r.title, chars: r.chars, chunks: r.chunks, searchable: r.searchable, createdAt: r.created_at, updatedAt: r.updated_at,
});
const DOC_SELECT = `
  SELECT d.id, d.title, length(d.content) AS chars, d.created_at, d.updated_at,
    (SELECT COUNT(*)::int FROM agent_doc_chunks c WHERE c.doc_id = d.id) AS chunks,
    NOT EXISTS (SELECT 1 FROM agent_doc_chunks c WHERE c.doc_id = d.id AND c.embedding IS NULL) AS searchable
  FROM agent_docs d`;

export const knowledge = {
  async docs(agentId: string): Promise<KnowledgeDoc[]> {
    const sql = await db();
    return (await sql.unsafe<DocRow[]>(`${DOC_SELECT} WHERE d.agent_id = $1 ORDER BY d.created_at`, [agentId])).map(toDoc);
  },
  async content(agentId: string, id: string): Promise<{ title: string; content: string } | undefined> {
    const sql = await db();
    const [row] = await sql<{ title: string; content: string }[]>`SELECT title, content FROM agent_docs WHERE id = ${id} AND agent_id = ${agentId}`;
    return row;
  },
  /** Characters used by the agent's documents, leaving out one being replaced. */
  async usage(agentId: string, exceptId?: string): Promise<{ docs: number; chars: number }> {
    const sql = await db();
    const [row] = await sql<{ docs: number; chars: number }[]>`
      SELECT COUNT(*)::int AS docs, COALESCE(SUM(length(content)), 0)::int AS chars FROM agent_docs
      WHERE agent_id = ${agentId} ${exceptId ? sql`AND id <> ${exceptId}` : sql``}`;
    return row;
  },
  /** Creates the document, or replaces its title, text and chunks when `id` is given. Undefined if that id is not the agent's. */
  async save(agentId: string, doc: { id?: string; title: string; content: string }, chunks: { text: string; embedding: number[] | null }[]): Promise<KnowledgeDoc | undefined> {
    const sql = await db();
    const now = new Date().toISOString();
    const id = doc.id ?? randomUUID();
    const ok = await sql.begin(async (tx) => {
      if (doc.id) {
        const updated = await tx`UPDATE agent_docs SET title = ${doc.title}, content = ${doc.content}, updated_at = ${now} WHERE id = ${id} AND agent_id = ${agentId} RETURNING id`;
        if (!updated.length) return false;
        await tx`DELETE FROM agent_doc_chunks WHERE doc_id = ${id}`;
      } else {
        await tx`INSERT INTO agent_docs (id, agent_id, title, content, created_at, updated_at) VALUES (${id}, ${agentId}, ${doc.title}, ${doc.content}, ${now}, ${now})`;
      }
      for (const [idx, c] of chunks.entries())
        await tx`INSERT INTO agent_doc_chunks (id, doc_id, agent_id, idx, text, embedding) VALUES (${randomUUID()}, ${id}, ${agentId}, ${idx}, ${c.text}, ${c.embedding}::real[])`;
      return true;
    });
    if (!ok) return undefined;
    const [row] = await sql.unsafe<DocRow[]>(`${DOC_SELECT} WHERE d.id = $1`, [id]);
    return toDoc(row);
  },
  async remove(agentId: string, id: string): Promise<boolean> {
    const sql = await db();
    return (await sql`DELETE FROM agent_docs WHERE id = ${id} AND agent_id = ${agentId} RETURNING id`).length > 0;
  },
  /** Every chunk of the agent in reading order (document, then position), with its embedding if it has one. */
  async chunks(agentId: string): Promise<{ title: string; text: string; embedding: number[] | null }[]> {
    const sql = await db();
    return sql<{ title: string; text: string; embedding: number[] | null }[]>`
      SELECT d.title, c.text, c.embedding FROM agent_doc_chunks c JOIN agent_docs d ON d.id = c.doc_id
      WHERE c.agent_id = ${agentId} ORDER BY d.created_at, c.idx`;
  },
};

type AccessRow = { id: string; requester_address: string; message: string; status: string; created_at: string; decided_at: string | null };
const toAccess = (r: AccessRow): AccessRequest => ({
  id: r.id, requester: r.requester_address, message: r.message, status: r.status as AccessStatus, createdAt: r.created_at, decidedAt: r.decided_at,
});
const ACCESS_COLS = "id, requester_address, message, status, created_at, decided_at";

export const accessRequests = {
  /** Every request to the agent: waiting ones first, then newest first. */
  async forAgent(agentId: string): Promise<AccessRequest[]> {
    const sql = await db();
    const rows = await sql.unsafe<AccessRow[]>(
      `SELECT ${ACCESS_COLS} FROM access_requests WHERE agent_id = $1 ORDER BY (status = 'pending') DESC, created_at DESC`, [agentId]);
    return rows.map(toAccess);
  },
  async mine(agentId: string, requester: string): Promise<AccessRequest | undefined> {
    const sql = await db();
    const [row] = await sql.unsafe<AccessRow[]>(`SELECT ${ACCESS_COLS} FROM access_requests WHERE agent_id = $1 AND requester_address = $2`, [agentId, requester]);
    return row && toAccess(row);
  },
  /** Creates the wallet's request, or reopens it (asking again after a rejection). */
  async open(agentId: string, requester: string, message: string, status: "pending" | "approved"): Promise<AccessRequest> {
    const sql = await db();
    const now = new Date().toISOString();
    const [row] = await sql<AccessRow[]>`
      INSERT INTO access_requests (id, agent_id, requester_address, message, status, created_at, decided_at)
      VALUES (${randomUUID()}, ${agentId}, ${requester}, ${message}, ${status}, ${now}, ${status === "approved" ? now : null})
      ON CONFLICT (agent_id, requester_address) DO UPDATE
        SET message = EXCLUDED.message, status = EXCLUDED.status, created_at = EXCLUDED.created_at, decided_at = EXCLUDED.decided_at
      RETURNING id, requester_address, message, status, created_at, decided_at`;
    return toAccess(row);
  },
  /** Moves a request in one of the `from` states to `to`. Undefined if it does not exist or is in another state. */
  async decide(agentId: string, id: string, from: AccessStatus[], to: AccessStatus): Promise<AccessRequest | undefined> {
    const sql = await db();
    const [row] = await sql<AccessRow[]>`
      UPDATE access_requests SET status = ${to}, decided_at = ${new Date().toISOString()}
      WHERE id = ${id} AND agent_id = ${agentId} AND status IN ${sql(from)}
      RETURNING id, requester_address, message, status, created_at, decided_at`;
    return row && toAccess(row);
  },
  /** Approves every waiting request, for when the owner turns auto-approve on. */
  async approvePending(agentId: string) {
    const sql = await db();
    await sql`UPDATE access_requests SET status = 'approved', decided_at = ${new Date().toISOString()} WHERE agent_id = ${agentId} AND status = 'pending'`;
  },
};

/** The split of one franchise job, fixed when it is hired. Amounts in micro-units (1 = 0.000001 stablecoin). */
export type JobSplit = {
  parentId: string; creatorPct: number; operatorPct: number; protocolPct: number;
  creator: number; operator: number; protocol: number;
  creatorAddress: string | null; operatorAddress: string | null;
};

type FranchiseRow = {
  slug: string; name: string; logo_at: string | null; price_usdc: number; franchise_status: string | null; owner_address: string | null;
  p_slug: string | null; p_name: string | null; created_at: string; jobs_completed: number; last_used_at: string | null;
  creator_micro: string; operator_micro: string; protocol_micro: string;
};

const FRANCHISE_SELECT = `
  SELECT a.slug, a.name, a.price_usdc, a.franchise_status, a.owner_address, a.created_at, p.slug AS p_slug, p.name AS p_name,
    (SELECT l.created_at FROM agent_logos l WHERE l.agent_id = a.id) AS logo_at,
    COUNT(j.id) FILTER (WHERE j.status = 'succeeded')::int AS jobs_completed,
    MAX(j.created_at) AS last_used_at,
    COALESCE(SUM(j.split_creator_micro) FILTER (WHERE j.status = 'succeeded'), 0)::text AS creator_micro,
    COALESCE(SUM(j.split_operator_micro) FILTER (WHERE j.status = 'succeeded'), 0)::text AS operator_micro,
    COALESCE(SUM(j.split_protocol_micro) FILTER (WHERE j.status = 'succeeded'), 0)::text AS protocol_micro
  FROM agents a LEFT JOIN agents p ON p.id = a.parent_agent_id LEFT JOIN jobs j ON j.agent_id = a.id`;

const toFranchise = (r: FranchiseRow): FranchiseSummary => ({
  slug: r.slug,
  name: r.name,
  logoAt: r.logo_at,
  priceUsdc: r.price_usdc,
  status: (r.p_slug ? r.franchise_status ?? "active" : "revoked") as FranchiseStatus,
  operator: r.owner_address,
  parent: r.p_slug ? { slug: r.p_slug, name: r.p_name! } : null,
  createdAt: r.created_at,
  jobsCompleted: r.jobs_completed,
  lastUsedAt: r.last_used_at,
  earnings: { creatorUsdc: Number(r.creator_micro) / 1e6, operatorUsdc: Number(r.operator_micro) / 1e6, protocolUsdc: Number(r.protocol_micro) / 1e6 },
});

/** Agent Franchise (test mode). Franchises are agents rows with parent_agent_id set; see schema.ts. */
export const franchises = {
  /** Agents open for franchising: public, not official and not franchises themselves. Most franchised first. */
  async open(limit: number): Promise<FranchisableAgent[]> {
    const sql = await db();
    const rows = await sql.unsafe<(AgentRow & { franchises: number })[]>(`
      SELECT * FROM (${AGENT_SELECT}
        WHERE a.allow_franchise AND NOT a.is_official AND NOT a.api_private AND a.parent_agent_id IS NULL) x
      CROSS JOIN LATERAL (SELECT COUNT(*)::int AS franchises FROM agents f WHERE f.parent_agent_id = x.id AND f.franchise_status = 'active') c
      ORDER BY c.franchises DESC, x.jobs_completed DESC, x.created_at DESC LIMIT $1`, [limit]);
    return rows.map((r) => ({ ...toPublic(toAgent(r)), franchises: r.franchises, creator: r.owner_address }));
  },
  /** Every franchise of one agent, newest first (for its creator). */
  async ofParent(parentId: string): Promise<FranchiseSummary[]> {
    const sql = await db();
    return (await sql.unsafe<FranchiseRow[]>(`${FRANCHISE_SELECT} WHERE a.parent_agent_id = $1 GROUP BY a.id, p.id ORDER BY a.created_at DESC`, [parentId])).map(toFranchise);
  },
  /** Every franchise one wallet runs, newest first (for its operator). */
  async ofOperator(address: string): Promise<FranchiseSummary[]> {
    const sql = await db();
    return (await sql.unsafe<FranchiseRow[]>(`${FRANCHISE_SELECT} WHERE a.owner_address = $1 AND a.parent_agent_id IS NOT NULL GROUP BY a.id, p.id ORDER BY a.created_at DESC`, [address])).map(toFranchise);
  },
  /** Whether the wallet already runs an open (active or paused) franchise of this agent. */
  async operatorHasOpen(parentId: string, address: string): Promise<boolean> {
    const sql = await db();
    return (await sql`SELECT 1 FROM agents WHERE parent_agent_id = ${parentId} AND owner_address = ${address} AND franchise_status IN ('active', 'paused')`).length > 0;
  },
  /** The creator's settings on their own agent. */
  async setSettings(agentId: string, s: { allowFranchise?: boolean; creatorPct?: number }) {
    const sql = await db();
    const cols: Record<string, unknown> = {};
    if (s.allowFranchise !== undefined) cols.allow_franchise = s.allowFranchise;
    if (s.creatorPct !== undefined) cols.franchise_creator_pct = s.creatorPct;
    if (Object.keys(cols).length) await sql`UPDATE agents SET ${sql(cols)} WHERE id = ${agentId}`;
  },
  /** Moves one franchise of the parent from one of the `from` states to `to`. False if it is not the parent's or in another state. */
  async setStatus(parentId: string, slug: string, from: FranchiseStatus[], to: FranchiseStatus): Promise<boolean> {
    const sql = await db();
    return (await sql`UPDATE agents SET franchise_status = ${to} WHERE slug = ${slug} AND parent_agent_id = ${parentId} AND franchise_status IN ${sql(from)} RETURNING id`).length > 0;
  },
};

export const nonces = {
  async create(nonce: string, ttlMs: number) {
    const sql = await db();
    const now = Date.now();
    await sql`DELETE FROM auth_nonces WHERE expires_at < ${new Date(now).toISOString()}`;
    await sql`INSERT INTO auth_nonces (nonce, expires_at) VALUES (${nonce}, ${new Date(now + ttlMs).toISOString()})`;
  },
  /** Deletes the nonce and reports whether it existed and had not expired, so each nonce works once. */
  async consume(nonce: string): Promise<boolean> {
    const sql = await db();
    const rows = await sql`DELETE FROM auth_nonces WHERE nonce = ${nonce} RETURNING expires_at`;
    return rows.length > 0 && String(rows[0].expires_at) > new Date().toISOString();
  },
};

export async function networkStats(): Promise<NetworkStats> {
  const sql = await db();
  const [row] = await sql<{ agents: number; businesses: number; franchises: number; customers: number; succeeded: number; failed: number; volume: number }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM agents) AS agents,
      (SELECT COUNT(DISTINCT owner_address)::int FROM agents WHERE owner_address IS NOT NULL) AS businesses,
      (SELECT COUNT(*)::int FROM agents WHERE parent_agent_id IS NOT NULL AND franchise_status = 'active') AS franchises,
      -- Older jobs have no customer_key: fall back to the same wallet-or-IP key the jobs route builds.
      COUNT(DISTINCT COALESCE(customer_key, CASE WHEN client_address IS NOT NULL THEN 'wallet:' || client_address ELSE 'ip:' || client_ip END))::int AS customers,
      COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
      COUNT(*) FILTER (WHERE status = 'failed' AND error IS DISTINCT FROM ${JOB_CANCELLED})::int AS failed,
      COALESCE(SUM(price_usdc) FILTER (WHERE status = 'succeeded'), 0)::float8 AS volume
    FROM jobs`;
  const finished = row.succeeded + row.failed;
  return {
    agentBusinesses: row.businesses,
    activeFranchises: row.franchises,
    uniqueCustomers: row.customers,
    activeAgents: row.agents,
    tasksCompleted: row.succeeded,
    volumeUsdc: row.volume,
    successRate: finished ? row.succeeded / finished : null,
  };
}

// Agent Treasury V1 (BUILD_PLAN F3.1), test mode. Read-only: computed from jobs and job_costs, nothing is written.
// Jobs fall in a period by when they were hired (created_at), like the Requests page.
const modelOr = (m: string): ModelId => (isModelId(m) ? m : DEFAULT_MODEL);

export const treasury = {
  /** One row per agent the owner has, with test income and AI cost of the jobs hired since `since` (null: all time). */
  // Franchise jobs (test mode): a franchise is an agents row owned by its operator, so its jobs land in the operator's
  // treasury with the operator's share as income and the job's AI cost. The creator of the original agent gets a
  // separate royalty line with the creator's share and no AI cost.
  async agents(owner: string, since: string | null): Promise<TreasuryAgent[]> {
    const sql = await db();
    const [rows, royalties] = await Promise.all([sql<{ slug: string; name: string; model: string; jobs: number; succeeded: number; income: number; recorded: number; legacy_in: number; legacy_out: number }[]>`
      SELECT a.slug, a.name, a.model,
        COUNT(j.id)::int AS jobs,
        COUNT(j.id) FILTER (WHERE j.status = 'succeeded')::int AS succeeded,
        COALESCE(SUM(CASE WHEN j.franchise_parent_id IS NULL THEN j.price_usdc ELSE j.split_operator_micro / 1e6 END)
          FILTER (WHERE j.status = 'succeeded'), 0)::float8 AS income,
        COALESCE(SUM(c.cost), 0)::float8 AS recorded,
        COALESCE(SUM(j.input_tokens) FILTER (WHERE c.n = 0), 0)::float8 AS legacy_in,
        COALESCE(SUM(j.output_tokens) FILTER (WHERE c.n = 0), 0)::float8 AS legacy_out
      FROM agents a
      LEFT JOIN jobs j ON j.agent_id = a.id ${since ? sql`AND j.created_at >= ${since}` : sql``}
      LEFT JOIN LATERAL (SELECT SUM(cost_usd) AS cost, COUNT(*)::int AS n FROM job_costs WHERE job_id = j.id) c ON j.id IS NOT NULL
      WHERE a.owner_address = ${owner}
      GROUP BY a.id ORDER BY income DESC, a.created_at DESC`,
    sql<{ slug: string; royalty: number }[]>`
      SELECT p.slug, COALESCE(SUM(j.split_creator_micro) FILTER (WHERE j.status = 'succeeded'), 0)::float8 / 1e6 AS royalty
      FROM jobs j JOIN agents p ON p.id = j.franchise_parent_id
      WHERE p.owner_address = ${owner} ${since ? sql`AND j.created_at >= ${since}` : sql``}
      GROUP BY p.slug`]);
    const royaltyOf = new Map(royalties.map((r) => [r.slug, r.royalty]));
    return rows.map((r) => {
      const estimated = estimateCostUsd(modelOr(r.model), r.legacy_in, r.legacy_out);
      const royalty = royaltyOf.get(r.slug) ?? 0;
      return {
        slug: r.slug, name: r.name, jobs: r.jobs, jobsSucceeded: r.succeeded, testIncomeUsd: r.income + royalty,
        aiCostUsd: r.recorded + estimated, aiCostEstimatedUsd: estimated, royaltyUsd: royalty,
      };
    }).sort((a, b) => b.testIncomeUsd - a.testIncomeUsd);
  },
  /** The owner's jobs as ledger lines, newest first. `agent` (a slug) narrows to one of the owner's agents. */
  async entries(owner: string, since: string | null, agent: string | null, limit: number, offset: number): Promise<{ entries: TreasuryEntry[]; total: number }> {
    const sql = await db();
    // Own jobs (normal and franchise) plus royalty lines from franchises of the owner's agents; see agents() above.
    const lines = sql`
      SELECT j.id, a.slug, a.name, a.model, j.status, j.error, j.created_at, j.finished_at, j.attempts, j.price_usdc, j.input_tokens, j.output_tokens,
        CASE WHEN j.franchise_parent_id IS NULL THEN 'job' ELSE 'franchise' END AS kind,
        CASE WHEN j.franchise_parent_id IS NULL THEN j.price_usdc ELSE j.split_operator_micro / 1e6 END::float8 AS share,
        j.split_operator_pct AS pct
      FROM jobs j JOIN agents a ON a.id = j.agent_id WHERE a.owner_address = ${owner}
      UNION ALL
      SELECT j.id, p.slug, p.name, p.model, j.status, j.error, j.created_at, j.finished_at, j.attempts, j.price_usdc, 0, 0,
        'royalty', (j.split_creator_micro / 1e6)::float8, j.split_creator_pct
      FROM jobs j JOIN agents p ON p.id = j.franchise_parent_id WHERE p.owner_address = ${owner}`;
    const where = sql`TRUE
      ${since ? sql`AND x.created_at >= ${since}` : sql``}
      ${agent ? sql`AND x.slug = ${agent}` : sql``}`;
    const [rows, [count]] = await Promise.all([
      sql<{ id: string; slug: string; name: string; model: string; status: JobStatus; error: string | null; created_at: string; finished_at: string | null; attempts: number; price_usdc: number; input_tokens: number; output_tokens: number; kind: TreasuryEntry["kind"]; share: number; pct: number | null; cost: number | null; n: number }[]>`
        SELECT x.*, c.cost::float8 AS cost, c.n
        FROM (${lines}) x
        LEFT JOIN LATERAL (SELECT SUM(cost_usd) AS cost, COUNT(*)::int AS n FROM job_costs WHERE job_id = x.id AND x.kind <> 'royalty') c ON TRUE
        WHERE ${where} ORDER BY x.created_at DESC, x.kind LIMIT ${limit} OFFSET ${offset}`,
      sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM (${lines}) x WHERE ${where}`,
    ]);
    return {
      total: count.n,
      entries: rows.map((r) => {
        const royalty = r.kind === "royalty";
        const estimated = !royalty && r.n === 0 && r.input_tokens + r.output_tokens > 0;
        return {
          jobId: r.id, agentSlug: r.slug, agentName: r.name, status: r.status, cancelled: r.status === "failed" && r.error === JOB_CANCELLED,
          createdAt: r.created_at, finishedAt: r.finished_at, attempts: r.attempts, priceUsd: r.price_usdc,
          testIncomeUsd: r.status === "succeeded" ? r.share : 0,
          aiCostUsd: royalty ? 0 : r.n > 0 ? (r.cost ?? 0) : estimated ? estimateCostUsd(modelOr(r.model), r.input_tokens, r.output_tokens) : 0,
          costSource: royalty ? "none" : r.n > 0 ? "recorded" : estimated ? "estimated" : "none",
          kind: r.kind, sharePct: r.kind === "job" ? null : r.pct,
        };
      }),
    };
  },
};
