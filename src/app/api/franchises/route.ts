import { franchises } from "@/server/db";

// Agents whose creators allow franchising, for operators to browse. Public fields only.
export async function GET() {
  return Response.json({ agents: await franchises.open(100) });
}
