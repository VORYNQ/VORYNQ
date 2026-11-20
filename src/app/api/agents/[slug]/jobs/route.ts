import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { MALFORMED_KEY, apiKeyFrom } from "@/server/api-keys";
import { agents, apiKeys, jobs } from "@/server/db";
import { franchiseGate, franchiseSplit } from "@/server/franchise";
import { LIMITS_SERVER, clientIp, fail, hashToken, ownerMatches, readJson } from "@/server/http";
import { notifyOwner } from "@/server/notify";
import { runJob } from "@/server/runner";
import { sessionAddress } from "@/server/session";
import { isThreadId, threadScope } from "@/server/threads";
import { JOB_LIMITS, LIMITS } from "@/shared/catalog";
import { officialAgentsReleased } from "@/shared/releases";

// Jobs run after the response is sent (see `after` below); give them room for web-tool turns.
export const maxDuration = 300;

// Recent jobs are private to the agent's owner: the signed-in owner wallet, or the legacy owner token
// of an agent created before wallet login.
export async function GET(req: Request, ctx: RouteContext<"/api/agents/[slug]/jobs">) {
  const agent = await agents.bySlug((await ctx.params).slug);
  if (!agent) return fail(404, "Agent not found.");
  const viewer = await sessionAddress();
  const isOwner = (viewer !== null && agent.ownerAddress === viewer) || ownerMatches(agent.ownerTokenHash, req.headers.get("x-owner-token"));
  if (!isOwner) return fail(401, "Sign in with the agent's owner wallet to see its jobs.");
  return Response.json({ jobs: await jobs.forAgent(agent.id, 20) });
}

export async function POST(req: Request, ctx: RouteContext<"/api/agents/[slug]/jobs">) {
  const agent = await agents.bySlug((await ctx.params).slug);
  if (!agent) return fail(404, "Agent not found.");

  const body = await readJson(req);
  if (body === "too_large") return fail(413, "Request body too large.");
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (!input || input.length > LIMITS.jobInputMax) return fail(400, `Describe the job in 1-${LIMITS.jobInputMax} characters.`, { input: "Required." });

  const ip = clientIp(req);
  const now = Date.now();
  if ((await jobs.countSince(new Date(now - 86_400_000).toISOString())) >= LIMITS_SERVER.jobsPerDay)
    return fail(503, "The network has reached today's job limit. Please try again tomorrow.");
  if ((await jobs.countSince(new Date(now - 600_000).toISOString(), ip)) >= LIMITS_SERVER.jobsPerIp10Min)
    return fail(429, "Too many jobs from this address. Please wait a few minutes.");

  // A key, when sent, must be valid for this agent, even on a public agent: a wrong key is a mistake worth reporting.
  const key = apiKeyFrom(req);
  if (key === "malformed") return fail(401, MALFORMED_KEY);
  const usedKey = key ? await apiKeys.use(agent.id, hashToken(key)) : null;
  if (usedKey === undefined) return fail(401, "This API key is not valid for this agent. It may be revoked or belong to another agent.");
  const apiKeyId = usedKey?.id ?? null;

  // Hiring works without signing in while payments are in test mode; a signed-in wallet is recorded on the job.
  const clientAddress = await sessionAddress();
  // An official agent takes jobs only from its owner (to test) until its release (src/shared/releases.ts).
  if (agent.official && !officialAgentsReleased() && !(clientAddress && clientAddress === agent.ownerAddress))
    return fail(403, "This agent is not open yet. It opens with the Finance Agents release; follow VORYNQ on X for the date.");
  // Private agents take jobs only with one of their keys, or from their own signed-in owner (to test from the page).
  if (agent.apiPrivate && !apiKeyId && !(clientAddress && clientAddress === agent.ownerAddress))
    return fail(401, "This agent is private. Send one of its API keys in the Authorization header: Bearer vrq_…");

  // Memory: a job joins the thread it names, or starts a new one (its own id) that a later job can continue.
  const threadId = body?.threadId;
  if (threadId !== undefined && threadId !== null && !isThreadId(threadId))
    return fail(400, "threadId must be 1-64 letters, digits or . _ : -", { threadId: "Invalid thread id." });
  const scope = threadScope(usedKey, clientAddress);
  if (threadId && !scope) return fail(401, "Sign in or send an API key to continue a conversation.");

  // Daily caps while VORYNQ pays for the AI (BUILD_PLAN F1.1, F1.2). A customer is their wallet, their API key or their IP.
  // The owner testing from the page and the owner's own API keys (one key may serve many users of the owner's app)
  // count toward the agent's cap only.
  const customer = usedKey ? (usedKey.holder ? `wallet:${usedKey.holder}` : `key:${usedKey.id}`) : clientAddress ? `wallet:${clientAddress}` : `ip:${ip}`;
  const ownerSide = usedKey ? !usedKey.holder : clientAddress !== null && clientAddress === agent.ownerAddress;
  const dayAgo = new Date(now - 86_400_000).toISOString();
  // A franchise must be open and its original agent available; all franchises of one agent also share a daily pool (see franchise.ts).
  const gate = await franchiseGate(agent, dayAgo);
  if ("error" in gate) return gate.error;
  if ((await jobs.countForAgentSince(agent.id, dayAgo)) >= (agent.dailyJobLimit ?? JOB_LIMITS.agentDailyDefault))
    return fail(429, "This agent has reached its daily job limit. Please try again tomorrow.");
  if (!ownerSide) {
    const perCustomer = agent.customerDailyLimit ?? JOB_LIMITS.customerDailyDefault;
    if ((await jobs.countForCustomerSince(dayAgo, customer, agent.id)) >= perCustomer)
      return fail(429, `You have reached this agent's limit of ${perCustomer} jobs a day. Please try again tomorrow.`);
    if ((await jobs.countForCustomerSince(dayAgo, customer)) >= JOB_LIMITS.freeJobsPerUserDay)
      return fail(429, `You have used your ${JOB_LIMITS.freeJobsPerUserDay} free jobs for today. Please try again tomorrow.`);
  }

  const id = randomUUID();
  await jobs.insert({
    id, agentId: agent.id, input, priceUsdc: agent.priceUsdc, clientIp: ip, clientAddress, apiKeyId, createdAt: new Date(now).toISOString(),
    thread: scope ? { id: threadId || id, scope } : null,
    customerKey: customer,
    // Franchise jobs record who gets what of the price, at today's terms (test mode: nothing is charged or paid).
    split: gate.parent ? franchiseSplit(agent, gate.parent) : null,
  });
  // Respond right away; the client polls GET /api/jobs/:id while the job runs.
  // The owner's notification goes out alongside the run, so a slow endpoint never delays the job.
  after(() => Promise.all([
    notifyOwner(agent.notifyUrl, "job.created", { agentSlug: agent.slug, agentName: agent.name, jobId: id, input }),
    runJob(id, agent, input),
  ]));
  return Response.json({ job: await jobs.byId(id) }, { status: 202 });
}
