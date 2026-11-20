"use client";

import { useEffect, useState } from "react";
import { api, formatUsdc } from "@/lib/api";
import type { NetworkStats } from "@/shared/types";
import { Icon } from "../ui/Icon";

const REFRESH_MS = 30_000;

// Payments are still in test mode, so the revenue tile keeps a "nothing charged" note until real payments go live.
const STATS: { label: string; note?: string; value: (s: NetworkStats) => string }[] = [
  { label: "Active Agent Businesses", value: (s) => s.agentBusinesses.toLocaleString("en-US") },
  { label: "Active Franchises", value: (s) => s.activeFranchises.toLocaleString("en-US") },
  { label: "Service Revenue", note: "nothing charged", value: (s) => `$${formatUsdc(s.volumeUsdc)}` },
  { label: "Active AI Agents", value: (s) => s.activeAgents.toLocaleString("en-US") },
  { label: "Tasks Completed", value: (s) => s.tasksCompleted.toLocaleString("en-US") },
  { label: "Unique Customers", value: (s) => s.uniqueCustomers.toLocaleString("en-US") },
  { label: "Verified Outcomes", value: (s) => (s.successRate === null ? "—" : `${Math.round(s.successRate * 100)}%`) },
];

/** Live network totals, refreshed every 30 seconds, scrolling sideways like the Built with strip. Shows dashes until the first load (or if it fails). */
export function NetworkActivity() {
  const [stats, setStats] = useState<NetworkStats | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.stats().then((s) => alive && setStats(s)).catch(() => {});
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <section aria-labelledby="network-activity">
      <div className="mb-5 flex items-center gap-4 px-1 max-sm:gap-3">
        <span className="grid size-7 place-items-center rounded-md border-2 border-live text-live">
          <Icon name="activity" className="size-4" />
        </span>
        <h2 id="network-activity" className="caps text-[19px] whitespace-nowrap max-sm:text-[15px]">VORYNQ Network Activity</h2>
        <span className="ml-auto flex items-center gap-2 text-[15px] tracking-[0.04em] text-muted uppercase max-sm:text-[13px]">
          <span className={`size-2 rounded-full ${stats ? "animate-pulse-dot bg-live" : "bg-muted/50"}`} />
          Live
        </span>
      </div>
      <div className="marquee-mask overflow-hidden">
        {/* Rendered twice with a right margin on every tile (not a gap) so the -50% marquee loop is seamless. Hover pauses it. */}
        <div className="flex w-max animate-marquee [animation-duration:45s] hover:[animation-play-state:paused] motion-reduce:animate-none">
          {[0, 1].map((copy) =>
            STATS.map((s) => (
              <div
                key={`${copy}-${s.label}`}
                aria-hidden={copy === 1}
                className="tile mr-4 flex min-h-[150px] w-[250px] flex-none flex-col justify-between max-sm:mr-3 max-sm:min-h-[130px] max-sm:w-[200px] max-sm:p-5"
              >
                <span className="text-[34px] leading-none font-bold text-heading max-sm:text-[26px]">
                  {stats ? s.value(stats) : <span className="text-muted">—</span>}
                </span>
                <span className="mt-6 text-[17px] text-muted max-sm:text-sm">
                  {s.label}
                  {s.note && <span className="block text-[13px] text-muted/80 max-sm:text-xs">{s.note}</span>}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
