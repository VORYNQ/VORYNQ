import { agents, jobs, toPublic } from "@/server/db";
import { fail } from "@/server/http";
import { sessionAddress } from "@/server/session";

// The signed-in wallet's agents, each with its 20 most recent jobs. Filtered by owner here on the server.
export async function GET() {
  const owner = await sessionAddress();
  if (!owner) return fail(401, "Connect your wallet and sign in to see your agents.");
  const list = await agents.byOwner(owner);
  const owned = await Promise.all(list.map(async (a) => ({ agent: toPublic(a, owner), jobs: await jobs.forAgent(a.id, 20) })));
  return Response.json({ agents: owned }, { headers: { "cache-control": "no-store" } });
}
