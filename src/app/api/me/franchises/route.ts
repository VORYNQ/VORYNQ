import { franchises } from "@/server/db";
import { fail } from "@/server/http";
import { sessionAddress } from "@/server/session";

// Franchises the signed-in wallet runs as an operator, with their test-mode earnings.
export async function GET() {
  const operator = await sessionAddress();
  if (!operator) return fail(401, "Connect your wallet and sign in to see your franchises.");
  return Response.json({ franchises: await franchises.ofOperator(operator) }, { headers: { "cache-control": "no-store" } });
}
