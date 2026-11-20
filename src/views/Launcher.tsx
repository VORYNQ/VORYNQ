import type { DashboardAgent, UsageDay } from "@/shared/types";
import { AgentsDashboard } from "../components/AgentsDashboard";
import { HeroGlow } from "../components/layout/PageHero";
import { NetworkCanvas } from "../components/visual/NetworkCanvas";

/** /agents/launcher: the network dashboard of every agent, from every creator. Creating an agent lives at /agents/launcher/new. */
export default function Launcher({ agents, usage, today }: { agents: DashboardAgent[]; usage: UsageDay[]; today: string }) {
  return (
    <section id="dashboard" className="relative min-h-[80vh] overflow-hidden pt-[110px] pb-20 max-sm:pt-[96px] max-md:pb-14">
      <NetworkCanvas />
      <HeroGlow />
      <div className="container-x relative z-[2]">
        <div className="mb-6">
          <h1 className="text-[clamp(30px,3.4vw,46px)]">Agent <span className="grad-text">dashboard.</span></h1>
          <p className="mt-2 max-w-[640px] text-[17px]">Every agent on VORYNQ, who created it, how often it is used and when it last worked.</p>
        </div>
        <AgentsDashboard agents={agents} usage={usage} today={today} />
      </div>
    </section>
  );
}
