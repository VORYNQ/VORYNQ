"use client";

import { useMemo, useState } from "react";
import type { UsageDay } from "@/shared/types";
import { formatUsdc } from "../lib/api";

const RANGES = [
  { days: 7, label: "7D", step: 1 },
  { days: 30, label: "30D", step: 1 },
  { days: 90, label: "90D", step: 7 }, // weekly bars, so 90 days stays readable
] as const;

const METRICS = [
  { id: "jobs", label: "Jobs" },
  { id: "revenue", label: "Revenue" },
] as const;

type Metric = (typeof METRICS)[number]["id"];
type Bucket = { start: string; end: string; jobs: number; succeeded: number; revenueUsdc: number };

const DAY_MS = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Splits the `count` days ending `endDay` (inclusive) into buckets of `step` days, oldest first. */
function bucketize(byDate: Map<string, UsageDay>, endDay: number, count: number, step: number): Bucket[] {
  const out: Bucket[] = [];
  for (let first = endDay - (count - 1) * DAY_MS; first <= endDay; first += step * DAY_MS) {
    const b: Bucket = { start: isoDay(first), end: isoDay(Math.min(first + (step - 1) * DAY_MS, endDay)), jobs: 0, succeeded: 0, revenueUsdc: 0 };
    for (let t = first; t < first + step * DAY_MS && t <= endDay; t += DAY_MS) {
      const d = byDate.get(isoDay(t));
      if (d) { b.jobs += d.jobs; b.succeeded += d.succeeded; b.revenueUsdc += d.revenueUsdc; }
    }
    out.push(b);
  }
  return out;
}

const value = (b: { jobs: number; revenueUsdc: number }, m: Metric) => (m === "jobs" ? b.jobs : b.revenueUsdc);
const format = (v: number, m: Metric) => (m === "jobs" ? v.toLocaleString("en-US") : `$${formatUsdc(v)}`);

/**
 * Jobs or revenue over the last 7, 30 or 90 days, with the change against the period before.
 * `today` (YYYY-MM-DD, UTC) comes from the server so both renders agree on the date range.
 */
export function UsageChart({ days, today, title, note }: { days: UsageDay[]; today: string; title: string; note?: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1]);
  const [metric, setMetric] = useState<Metric>("jobs");
  const [active, setActive] = useState<number | null>(null);

  const { buckets, total, previous } = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const end = Date.parse(`${today}T00:00:00Z`);
    const buckets = bucketize(byDate, end, range.days, range.step);
    const prev = bucketize(byDate, end - range.days * DAY_MS, range.days, range.days)[0];
    const sum = (bs: Bucket[]) => bs.reduce((acc, b) => ({ jobs: acc.jobs + b.jobs, revenueUsdc: acc.revenueUsdc + b.revenueUsdc }), { jobs: 0, revenueUsdc: 0 });
    return { buckets, total: sum(buckets), previous: prev };
  }, [days, today, range]);

  const current = value(total, metric);
  const before = value(previous, metric);
  const change = before > 0 ? (current - before) / before : null;
  const max = Math.max(...buckets.map((b) => value(b, metric)), metric === "jobs" ? 1 : 0.01);
  const hovered = active === null ? null : buckets[active];
  const period = (b: Bucket) => (b.start === b.end ? shortDate(b.start) : `${shortDate(b.start)} – ${shortDate(b.end)}`);

  const toggle = (on: boolean) =>
    `h-8 cursor-pointer rounded-full px-3 text-xs font-semibold transition-colors ${on ? "bg-violet-2/15 text-heading" : "text-muted hover:text-heading"}`;

  return (
    <section aria-label={title} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      {/* Filters in one row above the chart. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-xl">{title}</h2>
        <div role="group" aria-label="Measure" className="flex rounded-full border border-line p-0.5">
          {METRICS.map((m) => (
            <button key={m.id} type="button" aria-pressed={metric === m.id} onClick={() => setMetric(m.id)} className={toggle(metric === m.id)}>{m.label}</button>
          ))}
        </div>
        <div role="group" aria-label="Time range" className="flex rounded-full border border-line p-0.5">
          {RANGES.map((r) => (
            <button key={r.days} type="button" aria-pressed={range.days === r.days} onClick={() => { setRange(r); setActive(null); }} className={toggle(range.days === r.days)}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <span className="text-[34px] leading-none font-semibold text-heading tabular-nums">{format(current, metric)}</span>
        <span className="pb-1 text-sm text-body">
          {change === null ? (
            `Nothing in the previous ${range.days} days to compare with`
          ) : (
            <>
              <span aria-hidden="true" className={change > 0 ? "text-mint" : change < 0 ? "text-magenta" : "text-muted"}>{change > 0 ? "▲" : change < 0 ? "▼" : "■"}</span>{" "}
              {change > 0 ? "+" : ""}{Math.round(change * 100)}% vs the previous {range.days} days ({format(before, metric)})
            </>
          )}
        </span>
      </div>

      {/* Tooltip line, with reserved height so the chart does not jump. */}
      <p aria-live="polite" className="mt-4 mb-1 h-5 text-xs text-body tabular-nums">
        {hovered
          ? `${period(hovered)}: ${hovered.jobs} ${hovered.jobs === 1 ? "job" : "jobs"} (${hovered.succeeded} succeeded) · $${formatUsdc(hovered.revenueUsdc)}`
          : current === 0 ? `No ${metric === "jobs" ? "jobs" : "revenue"} in this period.` : ""}
      </p>

      <div className="relative">
        <span className="absolute -top-0.5 left-0 text-[11px] text-muted tabular-nums" aria-hidden="true">{format(max, metric)}</span>
        <div className="flex h-36 items-end gap-[2px] border-b border-line pt-4" onMouseLeave={() => setActive(null)} aria-hidden="true">
          {buckets.map((b, i) => {
            const v = value(b, metric);
            return (
              // Each column is the hover target, taller than its bar.
              <div key={b.start} className="flex h-full min-w-0 flex-1 flex-col justify-end" onMouseEnter={() => setActive(i)}>
                <div
                  className={`rounded-t-[4px] bg-violet-2 transition-opacity ${active !== null && active !== i ? "opacity-40" : ""}`}
                  style={{ height: v > 0 ? `max(2px, ${(v / max) * 100}%)` : 0 }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted" aria-hidden="true">
        <span>{shortDate(buckets[0].start)}</span>
        <span>Today</span>
      </div>

      {note && <p className="mt-4 text-xs text-muted">{note}</p>}

      <table className="sr-only">
        <caption>{title}, last {range.days} days</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Jobs</th><th scope="col">Succeeded</th><th scope="col">Revenue (stablecoins)</th></tr></thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.start}><td>{period(b)}</td><td>{b.jobs}</td><td>{b.succeeded}</td><td>{formatUsdc(b.revenueUsdc)}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
