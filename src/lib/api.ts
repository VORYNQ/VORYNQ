// Thin client for the VORYNQ API (Route Handlers under src/app/api).
import type { AGENT_CATEGORIES, AgentCategoryId, LAUNCHER_TOOLS, LIMITS, MODELS } from "@/shared/catalog";
import type { AccessRequest, AgentExample, AgentPublic, KnowledgeDoc, ApiError, ApiKeyInfo, MyAccess, CreateAgentRequest, CreateAgentResponse, Job, NetworkStats, OwnedAgent, OwnerJob, FranchisableAgent, FranchiseSummary, RequestFilters, TreasuryPeriod, TreasuryReport } from "@/shared/types";

type TreasuryQuery = { period: TreasuryPeriod; agent?: string };
const treasuryQuery = (q: TreasuryQuery, extra: Record<string, string>) =>
  new URLSearchParams({ period: q.period, ...(q.agent ? { agent: q.agent } : {}), ...extra }).toString();

export class ApiRequestError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const OFFLINE = "Can't reach the VORYNQ API. Please try again.";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  } catch {
    throw new ApiRequestError(0, OFFLINE);
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  if (!res.ok || !data) {
    // A non-JSON reply (e.g. an HTML error page) means the API itself failed.
    if (!data) throw new ApiRequestError(res.status, OFFLINE);
    throw new ApiRequestError(res.status, data.error ?? `Request failed (${res.status}).`, data.fields);
  }
  return data;
}

export type Meta = {
  categories: typeof AGENT_CATEGORIES;
  models: typeof MODELS;
  tools: typeof LAUNCHER_TOOLS;
  limits: typeof LIMITS;
  credentialsConfigured: boolean;
  paymentsEnabled: boolean;
};

function requestQuery(filters: RequestFilters, extra: Record<string, string>): string {
  const q = new URLSearchParams(extra);
  for (const [k, v] of Object.entries(filters)) if (v) q.set(k, String(v));
  return q.toString();
}

export const api = {
  meta: () => request<Meta>("/api/meta"),
  /** Adds an email to the launch-update list. `website` is a hidden field that only bots fill in. */
  joinWaitlist: (email: string, website: string) =>
    request<{ ok: true }>("/api/waitlist", { method: "POST", body: JSON.stringify({ email, website }) }),
  stats: () => request<NetworkStats>("/api/stats"),
  listAgents: (category?: AgentCategoryId) =>
    request<{ agents: AgentPublic[] }>(category ? `/api/agents?category=${category}` : "/api/agents").then((r) => r.agents),
  getAgent: (slug: string) => request<{ agent: AgentPublic }>(`/api/agents/${encodeURIComponent(slug)}`).then((r) => r.agent),
  /** False when another agent already uses this name (ignoring case). */
  nameAvailable: (name: string) =>
    request<{ available: boolean }>(`/api/agents/name-check?name=${encodeURIComponent(name)}`).then((r) => r.available),
  createAgent: (body: CreateAgentRequest) =>
    request<CreateAgentResponse>("/api/agents", { method: "POST", body: JSON.stringify(body) }),
  /** With threadId the job continues that conversation and the agent remembers its earlier jobs. */
  runJob: (slug: string, input: string, threadId?: string | null) =>
    request<{ job: Job }>(`/api/agents/${encodeURIComponent(slug)}/jobs`, { method: "POST", body: JSON.stringify({ input, ...(threadId ? { threadId } : {}) }) }).then((r) => r.job),
  /** Forgets a conversation of the signed-in wallet. */
  forgetThread: (slug: string, threadId: string) =>
    request<{ forgotten: number }>(`/api/agents/${encodeURIComponent(slug)}/threads/${encodeURIComponent(threadId)}`, { method: "DELETE" }),
  /** Link to download a conversation as JSON (signed-in wallet's cookie authorizes it). */
  threadUrl: (slug: string, threadId: string) => `/api/agents/${encodeURIComponent(slug)}/threads/${encodeURIComponent(threadId)}`,
  getJob: (id: string) => request<{ job: Job }>(`/api/jobs/${encodeURIComponent(id)}`).then((r) => r.job),
  /** The agent's recent jobs. The signed-in owner wallet is enough; a legacy owner token also works. */
  ownerJobs: (slug: string, token?: string | null) =>
    request<{ jobs: Job[] }>(`/api/agents/${encodeURIComponent(slug)}/jobs`, { headers: token ? { "x-owner-token": token } : {} }).then((r) => r.jobs),
  /** Agents owned by the signed-in wallet, with their recent jobs. */
  myAgents: () => request<{ agents: OwnedAgent[] }>("/api/me/agents").then((r) => r.agents),
  updateAgent: (slug: string, patch: Partial<CreateAgentRequest> & { apiPrivate?: boolean; autoApprove?: boolean; dailyJobLimit?: number | null; customerDailyLimit?: number | null }) =>
    request<{ agent: AgentPublic }>(`/api/agents/${encodeURIComponent(slug)}`, { method: "PATCH", body: JSON.stringify(patch) }).then((r) => r.agent),
  /** The signed-in wallet's access request to a private agent, or null if it has not asked. */
  myAccess: (slug: string) => request<{ access: MyAccess | null }>(`/api/agents/${encodeURIComponent(slug)}/access`).then((r) => r.access),
  requestAccess: (slug: string, message: string) =>
    request<{ access: MyAccess }>(`/api/agents/${encodeURIComponent(slug)}/access`, { method: "POST", body: JSON.stringify({ message }) }).then((r) => r.access),
  /** Approved requesters: makes their own key (replacing the old one). `key` is returned only this once. */
  createAccessKey: (slug: string) =>
    request<{ key: string; info: ApiKeyInfo }>(`/api/agents/${encodeURIComponent(slug)}/access/key`, { method: "POST" }),
  /** Owner only: requests for access, waiting ones first. */
  accessRequests: (slug: string) =>
    request<{ requests: AccessRequest[] }>(`/api/agents/${encodeURIComponent(slug)}/access-requests`).then((r) => r.requests),
  decideAccess: (slug: string, id: string, action: "approve" | "reject" | "revoke") =>
    request<{ request: AccessRequest }>(`/api/agents/${encodeURIComponent(slug)}/access-requests/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action }) }).then((r) => r.request),
  /** Owner only: training examples sent with every job. */
  listExamples: (slug: string) => request<{ examples: AgentExample[] }>(`/api/agents/${encodeURIComponent(slug)}/examples`).then((r) => r.examples),
  addExample: (slug: string, body: { input: string; output: string; sourceJobId?: string }) =>
    request<{ example: AgentExample }>(`/api/agents/${encodeURIComponent(slug)}/examples`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.example),
  updateExample: (slug: string, id: string, body: { input: string; output: string }) =>
    request<{ example: AgentExample }>(`/api/agents/${encodeURIComponent(slug)}/examples/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.example),
  deleteExample: (slug: string, id: string) =>
    request<{ deleted: string }>(`/api/agents/${encodeURIComponent(slug)}/examples/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** Owner only: knowledge base documents (without text) and characters used. */
  listKnowledge: (slug: string) => request<{ docs: KnowledgeDoc[]; usedChars: number }>(`/api/agents/${encodeURIComponent(slug)}/knowledge`),
  getKnowledge: (slug: string, id: string) =>
    request<{ title: string; content: string }>(`/api/agents/${encodeURIComponent(slug)}/knowledge/${encodeURIComponent(id)}`),
  /** Adds a document, or replaces one when id is given. */
  saveKnowledge: (slug: string, doc: { id?: string; title: string; content: string }) =>
    request<{ doc: KnowledgeDoc }>(`/api/agents/${encodeURIComponent(slug)}/knowledge${doc.id ? `/${encodeURIComponent(doc.id)}` : ""}`, {
      method: doc.id ? "PATCH" : "POST",
      body: JSON.stringify({ title: doc.title, content: doc.content }),
    }).then((r) => r.doc),
  deleteKnowledge: (slug: string, id: string) =>
    request<{ deleted: string }>(`/api/agents/${encodeURIComponent(slug)}/knowledge/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** Owner only: generates a new AI logo. Resolves to its new logoAt. */
  regenerateLogo: (slug: string) =>
    request<{ logoAt: string }>(`/api/agents/${encodeURIComponent(slug)}/logo`, { method: "POST" }).then((r) => r.logoAt),
  deleteAgent: (slug: string) => request<{ deleted: string }>(`/api/agents/${encodeURIComponent(slug)}`, { method: "DELETE" }),
  /** Requests to every agent the signed-in wallet owns, newest first, 25 per page. */
  requests: (filters: RequestFilters, page: number) =>
    request<{ jobs: OwnerJob[]; total: number; page: number; pageSize: number }>(`/api/me/requests?${requestQuery(filters, { page: String(page) })}`),
  /** Download link for the same requests as CSV. */
  requestsCsvUrl: (filters: RequestFilters) => `/api/me/requests?${requestQuery(filters, { format: "csv" })}`,
  /** The signed-in owner's treasury (test mode), 25 ledger lines per page. */
  treasury: (q: TreasuryQuery, page: number) => request<TreasuryReport>(`/api/me/treasury?${treasuryQuery(q, { page: String(page) })}`),
  treasuryCsvUrl: (q: TreasuryQuery) => `/api/me/treasury?${treasuryQuery(q, { format: "csv" })}`,
  updateJob: (id: string, patch: { note?: string; reviewed?: boolean }) =>
    request<{ ok: true }>(`/api/jobs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  rerunJob: (id: string) => request<{ job: Job }>(`/api/jobs/${encodeURIComponent(id)}/rerun`, { method: "POST" }).then((r) => r.job),
  cancelJob: (id: string) => request<{ job: Job }>(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" }).then((r) => r.job),
  /** The agent's API keys (owner only). */
  listKeys: (slug: string) => request<{ keys: ApiKeyInfo[] }>(`/api/agents/${encodeURIComponent(slug)}/keys`).then((r) => r.keys),
  /** Creates a key. `key` is the full key, returned only this once. */
  createKey: (slug: string, label: string) =>
    request<{ key: string; info: ApiKeyInfo }>(`/api/agents/${encodeURIComponent(slug)}/keys`, { method: "POST", body: JSON.stringify({ label }) }),
  revokeKey: (slug: string, id: string) =>
    request<{ revoked: string }>(`/api/agents/${encodeURIComponent(slug)}/keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** Agent Franchise (test mode). Agents open for franchising, for operators to browse. */
  franchisable: () => request<{ agents: FranchisableAgent[] }>("/api/franchises").then((r) => r.agents),
  /** Franchises the signed-in wallet runs. */
  myFranchises: () => request<{ franchises: FranchiseSummary[] }>("/api/me/franchises").then((r) => r.franchises),
  /** Opens a franchise of an agent: only the operator's own storefront is sent. */
  openFranchise: (slug: string, body: { name: string; description: string; priceUsdc: number }) =>
    request<{ agent: AgentPublic }>(`/api/agents/${encodeURIComponent(slug)}/franchises`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.agent),
  /** Creator only: franchise settings and every franchise of the agent. */
  agentFranchises: (slug: string) =>
    request<{ allowFranchise: boolean; creatorPct: number; franchises: FranchiseSummary[] }>(`/api/agents/${encodeURIComponent(slug)}/franchises`),
  setFranchiseSettings: (slug: string, body: { allowFranchise?: boolean; creatorPct?: number }) =>
    request<{ allowFranchise: boolean; creatorPct: number }>(`/api/agents/${encodeURIComponent(slug)}/franchises`, { method: "PATCH", body: JSON.stringify(body) }),
  /** Creator only: pause, resume or close one franchise of the agent. */
  decideFranchise: (slug: string, franchise: string, action: "pause" | "resume" | "revoke") =>
    request<{ franchise: FranchiseSummary | null }>(`/api/agents/${encodeURIComponent(slug)}/franchises/${encodeURIComponent(franchise)}`, { method: "PATCH", body: JSON.stringify({ action }) }),
  /** Agents created in this browser before wallet login that the signed-in wallet can claim (dryRun), or claims them. */
  claim: (claims: { slug: string; token: string }[], dryRun: boolean) =>
    request<{ claimable?: { slug: string; name: string }[]; claimed?: { slug: string; name: string }[]; stale: string[] }>("/api/me/claim", {
      method: "POST",
      body: JSON.stringify({ claims, dryRun }),
    }),
};

/** Owner tokens of agents created before wallet login, kept in the browser that created them.
 *  They are only used now to claim those agents for a wallet (and as a fallback to view their jobs). */
export const ownerTokens = {
  /** Every saved slug and token. */
  all(): { slug: string; token: string }[] {
    return this.slugs().flatMap((slug) => {
      const token = this.get(slug);
      return token ? [{ slug, token }] : [];
    });
  },
  remove(slug: string) {
    try {
      localStorage.removeItem(`vorynq:owner:${slug}`);
    } catch {}
  },
  get(slug: string): string | null {
    try {
      return localStorage.getItem(`vorynq:owner:${slug}`);
    } catch {
      return null;
    }
  },
  /** Slugs of every agent created in this browser. */
  slugs(): string[] {
    try {
      const prefix = "vorynq:owner:";
      return Object.keys(localStorage).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    } catch {
      return [];
    }
  },
};

export const initials = (name: string) =>
  name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "AI";

export const formatUsdc = (n: number) => n.toFixed(2);
