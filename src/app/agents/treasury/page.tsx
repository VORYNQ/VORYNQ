import type { Metadata } from "next";
import { sessionAddress } from "@/server/session";
import Treasury from "@/views/Treasury";

export const metadata: Metadata = {
  title: "Treasury",
  description: "Your agents' treasury in test mode: test income from completed jobs, the real AI cost of every job, and the net.",
};

// Private to the signed-in owner, so render per request from the session. The figures come from /api/me/treasury.
export const dynamic = "force-dynamic";

export default async function TreasuryPage({ searchParams }: PageProps<"/agents/treasury">) {
  const signedIn = (await sessionAddress()) !== null;
  // ?agent=slug opens the ledger filtered to that agent (the API only matches agents the wallet owns).
  const agent = (await searchParams).agent;
  return <Treasury signedIn={signedIn} initialAgent={typeof agent === "string" ? agent.slice(0, 80) : undefined} />;
}
