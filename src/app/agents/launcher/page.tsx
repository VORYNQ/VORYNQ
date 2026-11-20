import type { Metadata } from "next";
import { agents, jobs } from "@/server/db";
import { officialAgentsReleased } from "@/shared/releases";
import Launcher from "@/views/Launcher";

export const metadata: Metadata = {
  title: "Agent Dashboard",
  description: "Every agent on VORYNQ: its category, how often it is used, the wallet that created it and when it last worked.",
};

// Usage changes with every job, so read it from the database on each request.
export const dynamic = "force-dynamic";

export default async function LauncherPage() {
  // Official agents are left out until their release (src/shared/releases.ts).
  const [list, usage] = await Promise.all([agents.dashboard(500, !officialAgentsReleased()), jobs.dailyUsage(null)]);
  return <Launcher agents={list} usage={usage} today={new Date().toISOString().slice(0, 10)} />;
}
