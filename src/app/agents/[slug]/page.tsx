import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { agents, jobs, toPublic } from "@/server/db";
import { LIMITS } from "@/shared/catalog";
import { sessionAddress } from "@/server/session";
import { officialAgentsReleased } from "@/shared/releases";
import AgentService from "@/views/AgentService";

// Agents are created at runtime, so each service page is rendered on request from the database.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/agents/[slug]">): Promise<Metadata> {
  const agent = await agents.bySlug((await params).slug);
  if (!agent || (agent.official && !officialAgentsReleased())) return { title: "Agent not found" };
  return { title: agent.name, description: agent.description || `Hire ${agent.name}, an AI agent on the VORYNQ network.` };
}

export default async function AgentPage({ params, searchParams }: PageProps<"/agents/[slug]">) {
  const agent = await agents.bySlug((await params).slug);
  if (!agent) notFound();
  const query = await searchParams;
  const justCreated = query.created === "1";
  // ?q= fills in the job box (example questions on /agents/finance).
  const question = typeof query.q === "string" ? query.q.slice(0, LIMITS.jobInputMax) : "";
  const viewer = await sessionAddress();
  // Usage and revenue over time are for the owner only; performance is public.
  const isOwner = Boolean(viewer && agent.ownerAddress === viewer);
  // An official agent before its release (src/shared/releases.ts) is visible to its owner only.
  if (agent.official && !officialAgentsReleased() && !isOwner) notFound();
  const [performance, usageDays] = await Promise.all([jobs.performance(agent.id), isOwner ? jobs.dailyUsage(agent.id) : null]);
  const usage = usageDays ? { days: usageDays, today: new Date().toISOString().slice(0, 10) } : null;
  return <AgentService agent={toPublic(agent, viewer)} performance={performance} usage={usage} justCreated={justCreated} question={question} />;
}
