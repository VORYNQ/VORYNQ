"use client";

import { useState } from "react";
import type { AgentPerformance } from "@/shared/types";

/** 18s, 1m 05s, 2h 03m. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "–";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

export const formatRate = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);

const weekLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[26px] leading-none font-semibold text-heading tabular-nums">{value}</div>
      <div className="mt-1.5 text-xs text-muted">{label}</div>
    </div>
  );
}

/** Public reliability card: success rate, run time and failed jobs, with finished jobs per week. */
export function PerformancePanel({ performance: p }: { performance: AgentPerformance }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...p.weeks.map((w) => w.succeeded + w.failed));
  const hovered = active === null ? null : p.weeks[active];
  const anyJobs = p.weeks.some((w) => w.succeeded + w.failed > 0);

  return (
    <section aria-labelledby="perf-heading" className="rounded-2xl border border-line bg-surface p-7">
      <h2 id="perf-heading" className="mb-1 text-xl">Performance</h2>
      <p className="mb-5 text-[13px] text-muted">Finished jobs in the last {p.days} days. Time runs from hire to result.</p>

      <div className="grid grid-cols-3 gap-4">
        <Figure value={formatRate(p.successRate)} label="Success rate" />
        <Figure value={formatDuration(p.avgRunSeconds)} label="Average time" />
        <Figure value={p.failed.toLocaleString()} label={p.failed === 1 ? "Failed job" : "Failed jobs"} />
      </div>
      {p.medianRunSeconds !== null && <p className="mt-3 text-xs text-muted">Typical (median) time: {formatDuration(p.medianRunSeconds)}</p>}

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted">
          <span>Jobs per week</span>
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm bg-mint" />Succeeded</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm bg-magenta" />Failed</span>
          </span>
        </div>

        {/* Tooltip line: reserved height so the chart does not jump on hover. */}
        <p aria-live="polite" className="mb-1 h-5 text-xs text-body tabular-nums">
          {hovered
            ? `Week of ${weekLabel(hovered.weekStart)}: ${hovered.succeeded} succeeded, ${hovered.failed} failed${hovered.avgRunSeconds !== null ? `, avg ${formatDuration(hovered.avgRunSeconds)}` : ""}`
            : !anyJobs ? "No finished jobs in the last 8 weeks." : ""}
        </p>

        <div className="flex h-24 items-end gap-1.5 border-b border-line" onMouseLeave={() => setActive(null)} aria-hidden="true">
          {p.weeks.map((w, i) => {
            const total = w.succeeded + w.failed;
            return (
              // The hit area is the full column, taller than the bar itself.
              <div key={w.weekStart} className="flex h-full flex-1 cursor-default flex-col justify-end" onMouseEnter={() => setActive(i)}>
                <div className={`flex flex-col gap-[2px] transition-opacity ${active !== null && active !== i ? "opacity-50" : ""}`} style={{ height: `${(total / max) * 100}%` }}>
                  {w.failed > 0 && <div className="rounded-t-[4px] bg-magenta" style={{ flexGrow: w.failed }} />}
                  {w.succeeded > 0 && <div className={`bg-mint ${w.failed ? "" : "rounded-t-[4px]"}`} style={{ flexGrow: w.succeeded }} />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted" aria-hidden="true">
          <span>{weekLabel(p.weeks[0].weekStart)}</span>
          <span>This week</span>
        </div>

        {/* The same numbers for screen readers. */}
        <table className="sr-only">
          <caption>Finished jobs per week</caption>
          <thead><tr><th scope="col">Week of</th><th scope="col">Succeeded</th><th scope="col">Failed</th><th scope="col">Average time</th></tr></thead>
          <tbody>
            {p.weeks.map((w) => (
              <tr key={w.weekStart}><td>{weekLabel(w.weekStart)}</td><td>{w.succeeded}</td><td>{w.failed}</td><td>{formatDuration(w.avgRunSeconds)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
