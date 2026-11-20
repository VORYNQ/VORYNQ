import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { agents, franchises, toPublic, type AgentRecord } from "@/server/db";
import { canCreateAgent, clientIp, fail, isNameConflict, readJson, slugify } from "@/server/http";
import { generateLogo } from "@/server/logo";
import { ownedAgent } from "@/server/owned-agent";
import { sessionAddress } from "@/server/session";
import { validateAgent } from "@/server/validate";
import { NAME_TAKEN } from "@/shared/catalog";
import { FRANCHISE, isCreatorPct } from "@/shared/franchise";

// Agent Franchise, test mode. GET and PATCH are for the agent's creator; POST opens a franchise for a signed-in operator.

/** Why this agent cannot be franchised, or null when it can. */
function notFranchisable(agent: Pick<AgentRecord, "official" | "franchise" | "apiPrivate">): string | null {
  // Official agents run on VORYNQ's own caps and brand, so they are not offered to operators.
  if (agent.official) return "Official VORYNQ agents cannot be franchised.";
  if (agent.franchise) return "A franchise cannot be franchised again.";
  if (agent.apiPrivate) return "Only public agents can be franchised. Make the agent public first.";
  return null;
}

// Creator: franchise settings and every franchise of the agent.
export async function GET(_req: Request, ctx: RouteContext<"/api/agents/[slug]/franchises">) {
  const owned = await ownedAgent((await ctx.params).slug);
  if ("error" in owned) return owned.error;
  return Response.json(
    { allowFranchise: owned.agent.allowFranchise, creatorPct: owned.agent.franchiseCreatorPct, franchises: await franchises.ofParent(owned.agent.id) },
    { headers: { "cache-control": "no-store" } },
  );
}

// Creator: turns franchising on or off and sets their share. A new share applies to jobs hired from then on.
export async function PATCH(req: Request, ctx: RouteContext<"/api/agents/[slug]/franchises">) {
  const owned = await ownedAgent((await ctx.params).slug);
  if ("error" in owned) return owned.error;
  const body = await readJson(req);
  if (body === "too_large") return fail(413, "Request body too large.");
  if (!body) return fail(400, "Send a JSON body.");

  const settings: { allowFranchise?: boolean; creatorPct?: number } = {};
  if (body.allowFranchise !== undefined) {
    if (typeof body.allowFranchise !== "boolean") return fail(400, "Turn franchising on or off.", { allowFranchise: "Use true or false." });
    settings.allowFranchise = body.allowFranchise;
  }
  if (body.creatorPct !== undefined) {
    if (!isCreatorPct(body.creatorPct))
      return fail(400, "Some fields need attention.", { creatorPct: `Use a whole number from ${FRANCHISE.creatorMinPct} to ${FRANCHISE.creatorMaxPct}.` });
    settings.creatorPct = body.creatorPct;
  }
  const why = notFranchisable(owned.agent);
  if (why && (settings.allowFranchise || settings.creatorPct !== undefined)) return fail(400, why);
  await franchises.setSettings(owned.agent.id, settings);
  const updated = (await agents.byId(owned.agent.id))!;
  return Response.json({ allowFranchise: updated.allowFranchise, creatorPct: updated.franchiseCreatorPct });
}

// Operator: opens a franchise of this agent with their own name, description and price.
export async function POST(req: Request, ctx: RouteContext<"/api/agents/[slug]/franchises">) {
  const operator = await sessionAddress();
  if (!operator) return fail(401, "Connect your wallet and sign in to open a franchise.");
  const parent = await agents.bySlug((await ctx.params).slug);
  if (!parent) return fail(404, "Agent not found.");
  const why = notFranchisable(parent);
  if (why) return fail(400, why);
  if (!parent.allowFranchise) return fail(403, "The creator of this agent does not allow franchises.");
  if (parent.ownerAddress === operator) return fail(400, "This is your own agent. Franchises are for other operators.");
  if (await franchises.operatorHasOpen(parent.id, operator)) return fail(409, "You already run a franchise of this agent.");

  const body = await readJson(req);
  if (body === "too_large") return fail(413, "Request body too large.");
  if (!body) return fail(400, "Send a JSON body.");
  // Only the storefront is read from the body: anything else sent is ignored, never stored.
  const result = validateAgent({ name: body.name ?? "", description: body.description ?? "", priceUsdc: body.priceUsdc ?? null }, true);
  if ("errors" in result) return fail(400, "Some fields need attention.", result.errors);
  const { name, description = "", priceUsdc } = result.ok;
  if (name === undefined || priceUsdc === undefined) return fail(400, "Some fields need attention.");
  if (await agents.nameTaken(name)) return fail(409, "Some fields need attention.", { name: NAME_TAKEN });

  const ip = clientIp(req);
  if (!(await canCreateAgent(ip))) return fail(429, "Too many agents created from this address. Try again in an hour.");

  const record: Omit<AgentRecord, "jobsCompleted"> = {
    id: randomUUID(),
    slug: await slugify(name),
    name,
    description,
    category: parent.category,
    tags: parent.tags,
    // Never the parent's: jobs read the parent's instructions on the server when they run (see src/server/franchise.ts).
    instructions: "",
    tools: [],
    model: parent.model,
    priceUsdc,
    ownerTokenHash: "",
    ownerAddress: operator,
    webhookUrl: null,
    notifyUrl: null,
    apiPrivate: false,
    autoApprove: false,
    official: false,
    createdAt: new Date().toISOString(),
    logoAt: null,
    dailyJobLimit: null,
    customerDailyLimit: null,
    allowFranchise: false,
    franchiseCreatorPct: FRANCHISE.creatorDefaultPct,
    franchise: { parent: { slug: parent.slug, name: parent.name }, status: "active" },
    parentAgentId: parent.id,
    parentAvailable: true,
  };
  try {
    await agents.insert(record, ip);
  } catch (err) {
    if (isNameConflict(err)) return fail(409, "Some fields need attention.", { name: NAME_TAKEN });
    throw err;
  }
  // The operator's own logo, made from the storefront name and description.
  after(() => generateLogo(record));
  const created = (await agents.byId(record.id))!;
  return Response.json({ agent: toPublic(created, operator) }, { status: 201 });
}
