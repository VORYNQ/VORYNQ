import { endSession, sessionAddress } from "@/server/session";

// The signed-in wallet, if any.
export async function GET() {
  return Response.json({ address: await sessionAddress() }, { headers: { "cache-control": "no-store" } });
}

// Signs out.
export async function DELETE() {
  await endSession();
  return Response.json({ address: null });
}
