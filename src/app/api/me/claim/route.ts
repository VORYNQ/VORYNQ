import { agents } from "@/server/db";
import { fail, ownerMatches, readJson } from "@/server/http";
import { sessionAddress } from "@/server/session";

const MAX_CLAIMS = 50;

// Moves agents created before wallet login (owned by a token saved in the browser) to the signed-in wallet.
// Body: { claims: [{ slug, token }], dryRun?: boolean }. Only agents whose token matches and that have no
// owner wallet yet are claimable. With dryRun nothing changes; the response lists what could be claimed.
export async function POST(req: Request) {
  const owner = await sessionAddress();
  if (!owner) return fail(401, "Connect your wallet and sign in first.");

  const body = await readJson(req);
  if (body === "too_large") return fail(413, "Request body too large.");
  const claims = Array.isArray(body?.claims) ? body.claims.slice(0, MAX_CLAIMS) : null;
  if (!claims) return fail(400, "Send the agents to claim.");

  const claimable: { slug: string; name: string }[] = [];
  /** Saved tokens the browser can forget: the agent is gone, already has an owner wallet, or the token is wrong. */
  const stale: string[] = [];
  for (const c of claims as { slug?: unknown; token?: unknown }[]) {
    if (typeof c?.slug !== "string" || typeof c.token !== "string") continue;
    const agent = await agents.bySlug(c.slug);
    if (!agent || agent.ownerAddress !== null || !ownerMatches(agent.ownerTokenHash, c.token)) {
      stale.push(c.slug);
      continue;
    }
    if (body?.dryRun === true || (await agents.claim(agent.id, owner))) claimable.push({ slug: agent.slug, name: agent.name });
    else stale.push(c.slug); // Claimed by another wallet a moment ago.
  }
  return Response.json(body?.dryRun === true ? { claimable, stale } : { claimed: claimable, stale });
}
