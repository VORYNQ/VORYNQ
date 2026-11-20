import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { agents, toPublic } from "@/server/db";
import { generateLogo } from "@/server/logo";
import { clientIp, fail, isNameConflict, readJson, slugify, canCreateAgent } from "@/server/http";
import { sessionAddress } from "@/server/session";
import { validateAgent, type ValidAgent } from "@/server/validate";
import { NAME_TAKEN, isAgentCategoryId } from "@/shared/catalog";
import { FRANCHISE } from "@/shared/franchise";
import { officialAgentsReleased } from "@/shared/releases";
import type { CreateAgentResponse } from "@/shared/types";

export async function GET(req: Request) {
  const category = new URL(req.url).searchParams.get("category");
  if (category !== null && !isAgentCategoryId(category)) return fail(400, "Unknown category.");
  // Official agents stay off the listings until their release (src/shared/releases.ts).
  const list = (await agents.latest(24, category ?? undefined)).filter((a) => !a.official || officialAgentsReleased());
  return Response.json({ agents: list.map((a) => toPublic(a)) });
}

// Publishing requires a signed-in wallet, which becomes the agent's owner.
export async function POST(req: Request) {
  const owner = await sessionAddress();
  if (!owner) return fail(401, "Connect your wallet and sign in to publish an agent.");

  const body = await readJson(req);
  if (body === "too_large") return fail(413, "Request body too large.");
  if (!body) return fail(400, "Send a JSON body.");

  const result = validateAgent(body, false);
  if ("errors" in result) return fail(400, "Some fields need attention.", result.errors);
  const fields = result.ok as ValidAgent;

  if (await agents.nameTaken(fields.name)) return fail(409, "Some fields need attention.", { name: NAME_TAKEN });

  const ip = clientIp(req);
  if (!(await canCreateAgent(ip))) return fail(429, "Too many agents created from this address. Try again in an hour.");

  const record = {
    ...fields,
    id: randomUUID(),
    slug: await slugify(fields.name),
    // Owner tokens belong to agents made before wallet login; new agents are owned by the wallet only.
    ownerTokenHash: "",
    ownerAddress: owner,
    apiPrivate: false,
    autoApprove: false,
    official: false,
    createdAt: new Date().toISOString(),
    logoAt: null,
    dailyJobLimit: null,
    customerDailyLimit: null,
    allowFranchise: false,
    franchiseCreatorPct: FRANCHISE.creatorDefaultPct,
    franchise: null,
    parentAgentId: null,
    parentAvailable: false,
  };
  try {
    await agents.insert(record, ip);
  } catch (err) {
    // Two people publishing the same name at once: the unique index lets only one through.
    if (isNameConflict(err)) return fail(409, "Some fields need attention.", { name: NAME_TAKEN });
    throw err;
  }
  // Ready by the time the new agent's page asks for it (the logo route would otherwise make it then).
  after(() => generateLogo(record));

  return Response.json({ agent: toPublic({ ...record, jobsCompleted: 0 }, owner) } satisfies CreateAgentResponse, { status: 201 });
}
