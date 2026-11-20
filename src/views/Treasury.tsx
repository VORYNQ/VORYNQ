"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { TreasuryEntry, TreasuryPeriod, TreasuryReport } from "@/shared/types";
import { RefreshOnSignIn } from "../components/RefreshOnSignIn";
import { ConnectWallet } from "../components/layout/ConnectWallet";
import { HeroGlow } from "../components/layout/PageHero";
import { Icon } from "../components/ui/Icon";
import { StatusPill } from "../components/ui/JobStatus";
import { NetworkCanvas } from "../components/visual/NetworkCanvas";
import { ApiRequestError, api } from "../lib/api";

const PERIODS: { value: TreasuryPeriod; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "All" },
];

const field = "h-10 rounded-xl border border-line bg-ink/60 px-3 text-sm text-heading focus:border-violet-2 focus:outline-none";

const message = (err: unknown) => (err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");

/** Dollars. AI costs are often fractions of a cent, so small amounts keep more digits. */
const usd = (n: number) => {
  const a = Math.abs(n);
  const s = a === 0 ? "0.00" : a < 0.01 ? a.toFixed(4) : a.toFixed(2);
  return `${n < 0 ? "−" : ""}$${s}`;
};

/** The label every income figure carries: this is not real money. */
function TestTag() {
  return <span className="inline-flex items-center rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-amber">Test mode · nothing charged</span>;
}

function RealTag() {
  return <span className="inline-flex items-center rounded-full border border-magenta/40 bg-magenta/10 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-magenta">Real cost · paid by VORYNQ</span>;
}

function Stat({ label, value, tag, note }: { label: string; value: string; tag: ReactNode; note: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">{label}</span>
        {tag}
      </div>
      <p className="mt-3 text-[clamp(26px,3vw,34px)] font-semibold text-heading tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

function costTitle(e: TreasuryEntry) {
  if (e.costSource === "estimated") return "Estimated from this job's tokens and the agent's current model: the job ran before AI costs were recorded per attempt.";
  if (e.costSource === "none") return "No AI model call was recorded for this job.";
  return e.attempts > 1 ? `Every attempt counts (${e.attempts} attempts).` : "Estimated from the tokens this job used.";
}

/** /agents/treasury: the signed-in owner's ledger across all their agents, in test mode. */
export default function Treasury({ signedIn, initialAgent }: { signedIn: boolean; initialAgent?: string }) {
  const [period, setPeriod] = useState<TreasuryPeriod>("30d");
  const [agent, setAgent] = useState<string | undefined>(initialAgent);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TreasuryReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!signedIn) return;
    api.treasury({ period, agent }, page).then((r) => { setData(r); setError(null); }, (err) => setError(message(err)));
  }, [signedIn, period, agent, page]);
  useEffect(load, [load]);

  // A slug in the link that is not one of this wallet's agents shows all agents instead.
  useEffect(() => {
    if (data && agent && !data.agents.some((a) => a.slug === agent)) setAgent(undefined);
  }, [data, agent]);

  const choose = (patch: { period?: TreasuryPeriod; agent?: string | null }) => {
    if (patch.period) setPeriod(patch.period);
    if (patch.agent !== undefined) setAgent(patch.agent ?? undefined);
    setPage(1);
  };

  const t = data?.totals;
  const net = t ? t.testIncomeUsd - t.aiCostUsd : 0;
  const from = data && data.total ? (page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(page * data.pageSize, data.total) : 0;

  return (
    <section className="relative min-h-svh overflow-hidden pt-[110px] pb-20 max-sm:pt-[96px]">
      <RefreshOnSignIn />
      <NetworkCanvas />
      <HeroGlow />
      <div className="container-x relative z-[2]">
        <nav aria-label="Breadcrumb" className="mb-2 flex gap-2 font-mono text-[12px] tracking-[0.08em] text-muted uppercase">
          <Link href="/agents/launcher" className="hover:text-heading">Dashboard</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-heading">Treasury</span>
        </nav>

        {!signedIn ? (
          <div className="mx-auto mt-6 max-w-[560px] rounded-3xl border border-line bg-ink-2/95 px-8 py-14 text-center backdrop-blur-xl max-sm:px-5">
            <span className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-violet-2/15 text-violet-2"><Icon name="wallet" className="size-7" /></span>
            <h1 className="text-[clamp(26px,3vw,36px)]">Connect your wallet to see your treasury</h1>
            <p className="mx-auto mt-3 max-w-[440px] text-[16px]">A treasury is private to the wallet that owns the agents.</p>
            <ConnectWallet className="mx-auto mt-7 w-fit" />
          </div>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-[clamp(30px,3.4vw,46px)]">Your <span className="grad-text">treasury.</span></h1>
                <p className="mt-2 max-w-[680px] text-[17px]">Income, AI cost and net for every agent you own. Only you can see this page.</p>
              </div>
              {data && data.total > 0 && (
                <a href={api.treasuryCsvUrl({ period, agent })} download className="btn btn-ghost btn-sm"><Icon name="columns" className="size-4" /> Export CSV</a>
              )}
            </div>

            <p role="note" className="mb-5 flex gap-3 rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-heading">
              <Icon name="alert" className="mt-0.5 size-4 flex-none text-amber" />
              <span>
                <strong>Test mode: nothing is charged.</strong> Income is the price of completed jobs, not money received.
                Stablecoin payments are planned for Q1 2027. The AI cost is real: VORYNQ pays it for every job, including failed ones.
              </span>
            </p>

            <div className="mb-5 flex flex-wrap items-center gap-2.5">
              <div role="group" aria-label="Period" className="flex rounded-xl border border-line bg-ink/60 p-1">
                {PERIODS.map((p) => (
                  <button key={p.value} type="button" aria-pressed={period === p.value} onClick={() => choose({ period: p.value })}
                    className={`h-8 min-w-12 cursor-pointer rounded-lg px-3 text-sm font-semibold transition-colors ${period === p.value ? "bg-violet-2/20 text-heading" : "text-muted hover:text-heading"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              {data && data.agents.length > 1 && (
                <label className="min-w-0 flex-[0_1_260px]"><span className="sr-only">Agent</span>
                  <select value={agent ?? ""} onChange={(e) => choose({ agent: e.target.value || null })} className={`${field} w-full`}>
                    <option value="">All agents</option>
                    {data.agents.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                  </select>
                </label>
              )}
            </div>

            {error && <p role="alert" className="mb-4 text-sm text-[#ff7e80]">{error}</p>}

            {!data || !t ? (
              !error && <p className="px-2 py-10 text-center text-sm text-muted">Loading your treasury…</p>
            ) : data.agents.length === 0 ? (
              <div role="status" className="rounded-2xl border border-dashed border-line-strong bg-ink-2/80 px-6 py-12 text-center">
                <p className="text-heading">You have no agents yet. Your treasury starts with your first agent.</p>
                <Link href="/agents/launcher/new" className="btn btn-primary btn-sm mt-5">Launch an agent</Link>
              </div>
            ) : (
              <>
                <div className="mb-5 grid gap-3 md:grid-cols-3">
                  <Stat label="Income" value={usd(t.testIncomeUsd)} tag={<TestTag />} note={`${t.jobsSucceeded.toLocaleString()} completed of ${t.jobs.toLocaleString()} jobs${t.royaltyUsd > 0 ? `, plus ${usd(t.royaltyUsd)} franchise royalty` : ""}`} />
                  <Stat label="AI cost" value={usd(t.aiCostUsd)} tag={<RealTag />}
                    note={t.aiCostEstimatedUsd > 0 ? `Estimated from tokens; ${usd(t.aiCostEstimatedUsd)} of it from older jobs` : "Estimated from tokens, every attempt counted"} />
                  <Stat label="Net" value={usd(net)} tag={<TestTag />} note="Test income minus AI cost" />
                </div>

                {!agent && data.agents.length > 1 && (
                  <section aria-labelledby="by-agent" className="mb-5 rounded-2xl border border-line bg-surface">
                    <h2 id="by-agent" className="border-b border-line px-5 py-4 text-xl">By agent</h2>
                    <div className="hidden grid-cols-[1fr_repeat(3,7.5rem)] gap-x-4 border-b border-line px-5 py-2 text-xs text-muted md:grid">
                      <span>Agent</span><span className="text-right">Income (test)</span><span className="text-right">AI cost</span><span className="text-right">Net (test)</span>
                    </div>
                    <ul className="divide-y divide-line">
                      {data.agents.map((a) => (
                        <li key={a.slug}>
                          <button type="button" onClick={() => choose({ agent: a.slug })} title="Show this agent's transactions"
                            className="grid w-full cursor-pointer grid-cols-3 gap-x-4 gap-y-1 px-5 py-3 text-left text-sm transition-colors hover:bg-surface-2 md:grid-cols-[1fr_repeat(3,7.5rem)] md:items-center">
                            <span className="col-span-3 min-w-0 truncate font-semibold text-heading md:col-span-1">
                              {a.name}<span className="ml-2 text-xs font-normal text-muted">{a.jobs.toLocaleString()} {a.jobs === 1 ? "job" : "jobs"}</span>
                            </span>
                            <span className="tabular-nums md:text-right"><span className="block text-xs text-muted md:hidden">Income (test)</span>{usd(a.testIncomeUsd)}</span>
                            <span className="tabular-nums md:text-right"><span className="block text-xs text-muted md:hidden">AI cost</span>{usd(a.aiCostUsd)}</span>
                            <span className="tabular-nums text-heading md:text-right"><span className="block text-xs text-muted md:hidden">Net (test)</span>{usd(a.testIncomeUsd - a.aiCostUsd)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section aria-labelledby="ledger" className="rounded-2xl border border-line bg-surface">
                  <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
                    <h2 id="ledger" className="mr-auto text-xl">Transactions</h2>
                    {agent && <button type="button" onClick={() => choose({ agent: null })} className="cursor-pointer text-sm text-muted hover:text-heading">Show all agents</button>}
                  </div>
                  {data.entries.length === 0 ? (
                    <p role="status" className="px-5 py-12 text-center text-heading">No jobs in this period.</p>
                  ) : (
                    <>
                      <div className="hidden grid-cols-[1fr_repeat(3,7.5rem)] gap-x-4 border-b border-line px-5 py-2 text-xs text-muted md:grid">
                        <span>Job</span><span className="text-right">Income (test)</span><span className="text-right">AI cost</span><span className="text-right">Net (test)</span>
                      </div>
                      <ul className="divide-y divide-line">
                        {data.entries.map((e) => (
                          <li key={`${e.jobId}-${e.kind}`}className="grid grid-cols-3 gap-x-4 gap-y-2 px-5 py-3 text-sm md:grid-cols-[1fr_repeat(3,7.5rem)] md:items-center">
                            <div className="col-span-3 flex min-w-0 items-center gap-3 md:col-span-1">
                              <span className="w-[6.5rem] flex-none">
                                {e.cancelled ? <span className="inline-flex rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted">Cancelled</span> : <StatusPill status={e.status} />}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-heading">{e.agentName}</span>
                                <span className="block text-xs text-muted" title={e.createdAt}>
                                  {e.kind === "royalty" ? `Franchise royalty ${e.sharePct ?? ""}% · ` : e.kind === "franchise" ? `Your franchise share ${e.sharePct ?? ""}% · ` : ""}
                                  {new Date(e.createdAt).toLocaleString()} · price {usd(e.priceUsd)}{e.attempts > 1 ? ` · ${e.attempts} attempts` : ""}
                                </span>
                              </span>
                            </div>
                            <span className="tabular-nums md:text-right"><span className="block text-xs text-muted md:hidden">Income (test)</span>{usd(e.testIncomeUsd)}</span>
                            <span className="tabular-nums md:text-right" title={costTitle(e)}>
                              <span className="block text-xs text-muted md:hidden">AI cost</span>{usd(e.aiCostUsd)}{e.costSource === "estimated" ? "*" : ""}
                            </span>
                            <span className="tabular-nums text-heading md:text-right"><span className="block text-xs text-muted md:hidden">Net (test)</span>{usd(e.testIncomeUsd - e.aiCostUsd)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm">
                    <span className="text-xs text-muted">Income counts completed jobs only; on franchise jobs it is your share of the price, and royalties carry no AI cost. Prices are in stablecoin. * Older job: AI cost estimated with the agent&apos;s current model.</span>
                    {data.total > data.pageSize && (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-muted tabular-nums">{from}–{to} of {data.total.toLocaleString()}</span>
                        <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn btn-ghost btn-sm disabled:opacity-50">Previous</button>
                        <button type="button" disabled={to >= data.total} onClick={() => setPage((p) => p + 1)} className="btn btn-ghost btn-sm disabled:opacity-50">Next</button>
                      </span>
                    )}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
