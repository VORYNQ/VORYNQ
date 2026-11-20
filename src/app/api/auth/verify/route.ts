import { nonces } from "@/server/db";
import { fail, readJson, siteHosts } from "@/server/http";
import { startSession } from "@/server/session";
import { checkSolanaSignIn } from "@/server/solana-auth";

// Checks a signed Sign In With Solana message and starts a session for its wallet.
// Signing is off-chain: no transaction and no fee.
export async function POST(req: Request) {
  try {
    return await verify(req);
  } catch (err) {
    // Unexpected failures (database, configuration): log the details for the server logs and tell the
    // browser plainly instead of sending an empty 500 the sign-in button can't explain.
    console.error("[auth/verify]", err);
    const kind = err instanceof Error ? err.name : "UnknownError";
    return Response.json({ error: `The server couldn't finish signing in (${kind}). Please try again in a moment.` }, { status: 500 });
  }
}

async function verify(req: Request) {
  const body = await readJson(req);
  if (body === "too_large") return fail(413, "Request body too large.");
  if (!body) return fail(400, "Send the signed message, its signature and the wallet address.");

  const check = checkSolanaSignIn(body, siteHosts(req));
  if (!check.ok) return fail(check.error.includes("Send the") || check.error.includes("not valid") ? 400 : 401, check.error);
  // The nonce must be one we issued and have not seen used.
  if (!(await nonces.consume(check.nonce))) return fail(401, "This sign-in request has expired. Please try again.");

  await startSession(check.address);
  return Response.json({ address: check.address });
}
