import type { Metadata } from "next";
import { agents } from "@/server/db";
import { sessionAddress } from "@/server/session";
import Requests from "@/views/Requests";

export const metadata: Metadata = {
  title: "Requests",
  description: "Every job sent to your agents: search, filter, review, re-run and export.",
};

// Private to the signed-in owner, so render per request from the session.
export const dynamic = "force-dynamic";

export default async function RequestsPage({ searchParams }: PageProps<"/agents/launcher/requests">) {
  const owner = await sessionAddress();
  const mine = owner ? (await agents.byOwner(owner)).map((a) => ({ slug: a.slug, name: a.name })) : null;
  // ?agent=slug (from an agent page) opens the list filtered to that agent.
  const agent = (await searchParams).agent;
  const initialAgent = typeof agent === "string" && mine?.some((a) => a.slug === agent) ? agent : undefined;
  return <Requests agents={mine} initialAgent={initialAgent} />;
}
