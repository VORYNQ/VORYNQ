"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AGENT_CATEGORIES } from "@/shared/catalog";
import type { DashboardAgent, UsageDay } from "@/shared/types";
import { formatUsdc } from "../lib/api";
import { useAuth } from "../lib/auth";

import { explorerAddressUrl, shortAddress } from "../shared/address";
import { formatDuration, formatRate } from "./AgentPerformance";
import { CategoryFilter, type CategoryFilterValue } from "./CategoryFilter";
import { ClaimBanner } from "./ClaimBanner";
import { UsageChart } from "./UsageChart";
import { ConnectWallet } from "./layout/ConnectWallet";
import { AgentAvatar } from "./ui/AgentAvatar";
import { CategoryBadge } from "./ui/CategoryBadge";
import { Icon, type IconName } from "./ui/Icon";
import { timeAgo } from "./ui/JobStatus";

const WEEK_MS = 7 * 24 * 3600 * 1000;

function Stat({ icon, tone, value, label }: { icon: IconName; tone: string; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <span className={`grid size-11 place-items-center rounded-xl ${tone}`}><Icon name={icon} className="size-5" /></span>
      <div className="mt-4 text-[30px] leading-none font-bold text-heading tabular-nums">{value}</div>
      <div className="mt-2 text-sm text-muted">{label}</div>
    </div>
  );
}

function Creator({ address, you }: { address: string | null; you: boolean }) {
  if (!address) return <span className="text-sm text-muted" title="Created before wallet sign-in and not claimed yet">Not linked</span>;
  return (
    <a href={explorerAddressUrl(address)} target="_blank" rel="noopener noreferrer" title={address}
      className="inline-flex items-center gap-2 font-mono text-[13px] text-heading hover:text-violet-2">
      {shortAddress(address)}
      {you && <span className="rounded-md bg-violet-2/15 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-violet-2">You</span>}
    </a>
  );
}

/** Public dashboard of every agent on the network: name, category, how often it was used, its creator wallet and when it was last used. */
export function AgentsDashboard({ agents, usage, today }: { agents: DashboardAgent[]; usage: UsageDay[]; today: string }) {
  const router = useRouter();
  const auth = useAuth();
  const [filter, setFilter] = useState<CategoryFilterValue>("all");
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Relative times depend on the clock, so render them only in the browser (server and client must match).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [agents]);

  const counts = useMemo(() => {
    const c = { all: agents.length } as Record<CategoryFilterValue, number>;
    for (const cat of AGENT_CATEGORIES) c[cat.id] = agents.filter((a) => a.category === cat.id).length;
    return c;
  }, [agents]);

  const totalUses = agents.reduce((n, a) => n + a.timesUsed, 0);
  const creators = new Set(agents.map((a) => a.creator).filter(Boolean)).size;
  const activeWeek = now === null ? null : agents.filter((a) => a.lastUsedAt && now - new Date(a.lastUsedAt).getTime() < WEEK_MS).length;

  const me = auth.address;
  const q = query.trim().toLowerCase();
  const visible = agents.filter(
    (a) =>
      (filter === "all" || a.category === filter) &&
      (!mineOnly || (me && a.creator === me)) &&
      (!q || a.name.toLowerCase().includes(q) || a.creator?.toLowerCase().includes(q))
  );

  function refresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 800);
  }

  const lastUsed = (a: DashboardAgent) => (now === null ? "…" : a.lastUsedAt ? timeAgo(a.lastUsedAt) : "Never");

  return (
    <div className="space-y-4 rounded-3xl border border-line bg-ink-2/95 p-3 shadow-[0_40px_120px_-60px_rgb(112_40_228/0.6)] backdrop-blur-xl sm:p-4">
      {me && <ClaimBanner address={me} onClaimed={() => router.refresh()} />}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon="bot" tone="bg-blue/12 text-blue" value={agents.length.toLocaleString()} label="Agents on the network" />
        <Stat icon="check" tone="bg-mint/12 text-mint" value={totalUses.toLocaleString()} label="Times agents were used" />
        <Stat icon="wallet" tone="bg-violet-2/15 text-violet-2" value={creators.toLocaleString()} label="Creator wallets" />
        <Stat icon="activity" tone="bg-amber/12 text-amber" value={activeWeek === null ? "–" : String(activeWeek)} label="Used in the last 7 days" />
      </div>

      <UsageChart days={usage} today={today} title="Network usage" note="Revenue counts the price of succeeded jobs. Jobs run in test mode, so nothing has been charged yet. Days are in UTC." />

      <section aria-labelledby="all-agents-title" className="rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <h2 id="all-agents-title" className="mr-auto text-xl">All agents</h2>
          <label className="relative min-w-[200px] flex-1 sm:max-w-[320px]">
            <span className="sr-only">Search by agent name or wallet</span>
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or wallet…"
              className="h-10 w-full rounded-xl border border-line bg-ink/60 pr-4 pl-11 text-sm text-heading placeholder:text-muted focus:border-violet-2 focus:outline-none" />
          </label>
          <button type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh"
            className="grid size-10 cursor-pointer place-items-center rounded-full border border-line text-body transition-colors hover:bg-surface-2 hover:text-heading disabled:cursor-wait">
            <Icon name="refresh" className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          {/* Creating an agent needs a signed-in wallet, so the button only appears once one is connected. */}
          {me ? (
            <>
              <Link href="/agents/launcher/requests" className="btn btn-ghost btn-sm flex-none"><Icon name="columns" className="size-4" /> Requests</Link>
              <Link href="/agents/treasury" className="btn btn-ghost btn-sm flex-none"><Icon name="wallet" className="size-4" /> Treasury</Link>
              <Link href="/agents/launcher/franchise" className="btn btn-ghost btn-sm flex-none"><Icon name="building" className="size-4" /> Franchise</Link>
              <Link href="/agents/launcher/new" className="btn btn-primary btn-sm flex-none"><Icon name="plus" className="size-4" /> New agent</Link>
            </>
          ) : (
            <ConnectWallet className="flex-none" label="Connect wallet to create" />
          )}
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <CategoryFilter value={filter} onChange={setFilter} counts={counts} className="min-w-0 flex-1" />
            {me && (
              <button type="button" aria-pressed={mineOnly} onClick={() => setMineOnly((m) => !m)}
                className={`inline-flex h-10 flex-none cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${
                  mineOnly ? "border-violet-2/70 bg-violet-2/15 text-heading" : "border-line text-body hover:border-line-strong hover:text-heading"
                }`}>
                <Icon name="wallet" className="size-4" /> My agents
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <div role="status" className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
              <p className="text-heading">{agents.length === 0 ? "No agents on the network yet." : "No agents match these filters."}</p>
              {agents.length === 0 && me && <Link href="/agents/launcher/new" className="btn btn-primary btn-sm mt-5">Launch the first agent</Link>}
            </div>
          ) : (
            <>
              {/* Table on wide screens */}
              <div className="overflow-x-auto rounded-xl border border-line max-md:hidden">
                <table className="w-full text-left text-[15px]">
                  <thead className="bg-ink/40 text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                    <tr>
                      <th scope="col" className="px-4 py-3">Agent</th>
                      <th scope="col" className="px-4 py-3">Category</th>
                      <th scope="col" className="px-4 py-3 text-right">Times used</th>
                      <th scope="col" className="px-4 py-3 text-right">Success</th>
                      <th scope="col" className="px-4 py-3 text-right">Avg time</th>
                      <th scope="col" className="px-4 py-3 text-right">Revenue</th>
                      <th scope="col" className="px-4 py-3">Creator wallet</th>
                      <th scope="col" className="px-4 py-3">Last used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((a) => (
                      <tr key={a.slug} className="border-t border-line align-middle transition-colors hover:bg-surface-2">
                        <td className="px-4 py-3">
                          <Link href={`/agents/${a.slug}`} className="flex items-center gap-3 font-semibold text-heading hover:text-violet-2">
                            <AgentAvatar name={a.name} slug={a.slug} logoAt={a.logoAt} className="size-9 rounded-xl text-xs" />
                            <span className="truncate">{a.name}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3"><CategoryBadge category={a.category} /></td>
                        <td className="px-4 py-3 text-right font-semibold text-heading tabular-nums">{a.timesUsed.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-heading tabular-nums">{formatRate(a.successRate)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-body tabular-nums">{formatDuration(a.avgRunSeconds)}</td>
                        <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-heading tabular-nums">${formatUsdc(a.revenueUsdc)}</td>
                        <td className="px-4 py-3"><Creator address={a.creator} you={Boolean(me && a.creator === me)} /></td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap text-body" title={a.lastUsedAt ?? undefined}>{lastUsed(a)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cards on phones */}
              <ul className="space-y-3 md:hidden">
                {visible.map((a) => (
                  <li key={a.slug} className="rounded-xl border border-line bg-ink/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/agents/${a.slug}`} className="flex min-w-0 items-center gap-3 font-semibold text-heading hover:text-violet-2"><AgentAvatar name={a.name} slug={a.slug} logoAt={a.logoAt} className="size-8 rounded-lg text-[11px]" /><span className="truncate">{a.name}</span></Link>
                      <CategoryBadge category={a.category} className="flex-none" />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-3 text-sm">
                      <div><dt className="text-xs text-muted">Used</dt><dd className="font-semibold text-heading tabular-nums">{a.timesUsed.toLocaleString()}</dd></div>
                      <div><dt className="text-xs text-muted">Success</dt><dd className="font-semibold text-heading tabular-nums">{formatRate(a.successRate)}</dd></div>
                      <div><dt className="text-xs text-muted">Avg time</dt><dd className="text-body tabular-nums">{formatDuration(a.avgRunSeconds)}</dd></div>
                      <div><dt className="text-xs text-muted">Revenue</dt><dd className="font-semibold text-heading tabular-nums">${formatUsdc(a.revenueUsdc)}</dd></div>
                      <div className="min-w-0"><dt className="text-xs text-muted">Creator</dt><dd className="truncate"><Creator address={a.creator} you={Boolean(me && a.creator === me)} /></dd></div>
                      <div><dt className="text-xs text-muted">Last used</dt><dd className="text-body">{lastUsed(a)}</dd></div>
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-4 text-xs text-muted">Times used counts every job an agent has run. Success is the share of finished jobs that succeeded; avg time runs from hire to result. Revenue adds up the stablecoin price of its completed jobs. Jobs are in test mode, so nothing has been charged yet.</p>
        </div>
      </section>
    </div>
  );
}
