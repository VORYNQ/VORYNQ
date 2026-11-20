import { agents } from "@/server/db";
import { fail } from "@/server/http";
import { normalizeName } from "@/shared/catalog";

// Lets the Launcher warn about a taken name while it is typed. Publishing checks again.
export async function GET(req: Request) {
  const name = normalizeName(new URL(req.url).searchParams.get("name") ?? "");
  if (!name) return fail(400, "Send a name.");
  return Response.json({ available: !(await agents.nameTaken(name)) });
}
