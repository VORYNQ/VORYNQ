"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FRANCHISE, operatorPct, type FranchiseStatus } from "@/shared/franchise";
import type { AgentPublic, FranchiseSummary } from "@/shared/types";
import { ApiRequestError, api, formatUsdc } from "../lib/api";
import { shortAddress } from "../shared/address";
import { AgentAvatar } from "./ui/AgentAvatar";
import { timeAgo } from "./ui/JobStatus";

const message = (err: unknown) => (err instanceof ApiRequestError ? Object.values(err.fields ?? {})[0] ?? err.message : "Something went wrong. Please try again.");

const STATUS: Record<FranchiseStatus, { label: string; tone: string }> = {
  active: { label: "Active", tone: "border-mint/40 bg-mint/10 text-mint" },
  paused: { label: "Paused", tone: "border-amber/40 bg-amber/10 text-amber" },
  revoked: { label: "Closed", tone: "border-line-strong bg-surface-2 text-muted" },
};

export function FranchiseStatusPill({ status }: { status: FranchiseStatus }) {
  const s = STATUS[status];
  return <span className={`inline-flex flex-none items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.tone}`}>{s.label}</span>;
}

/** The three-way split of one job at a given creator share, e.g. "Creator 20% · Operator 75% · VORYNQ 5%". */
export function SplitLine({ creatorPct, className = "" }: { creatorPct: number; className?: string }) {
  return (
    <span className={`tabular-nums ${className}`}>
      Creator {creatorPct}% · Operator {operatorPct(creatorPct)}% · VORYNQ {FRANCHISE.protocolPct}%
    </span>
  );
}

/** Creator-only, on their own agent's page: allow franchising, set the split, and pause, resume or close franchises. */
export function FranchisePanel({ agent }: { agent: AgentPublic }) {
  const router = useRouter();
  const [allow, setAllow] = useState(agent.allowFranchise);
  const [savedPct, setSavedPct] = useState(agent.franchiseCreatorPct);
  const [pct, setPct] = useState(String(agent.franchiseCreatorPct));
  const [list, setList] = useState<FranchiseSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.agentFranchises(agent.slug).then((r) => {
      setAllow(r.allowFranchise);
      setSavedPct(r.creatorPct);
      setPct(String(r.creatorPct));
      setList(r.franchises);
    }, (err) => setError(message(err)));
  }, [agent.slug]);

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  }

  const toggle = () =>
    run("allow", async () => {
      const r = await api.setFranchiseSettings(agent.slug, { allowFranchise: !allow });
      setAllow(r.allowFranchise);
      router.refresh();
    });

  const pctNumber = Number(pct);
  const pctValid = pct.trim() !== "" && Number.isInteger(pctNumber) && pctNumber >= FRANCHISE.creatorMinPct && pctNumber <= FRANCHISE.creatorMaxPct;
  const saveSplit = (e: FormEvent) => {
    e.preventDefault();
    run("split", async () => {
      const r = await api.setFranchiseSettings(agent.slug, { creatorPct: pctNumber });
      setSavedPct(r.creatorPct);
      setPct(String(r.creatorPct));
    });
  };

  const decide = (f: FranchiseSummary, action: "pause" | "resume" | "revoke") =>
    run(`${action}:${f.slug}`, async () => {
      if (action === "revoke" && !window.confirm(`Close ${f.name} for good? It stops taking jobs and cannot be reopened.`)) return;
      const r = await api.decideFranchise(agent.slug, f.slug, action);
      if (r.franchise) setList((l) => l?.map((x) => (x.slug === f.slug ? r.franchise! : x)) ?? null);
    });

  const field = "h-11 w-24 rounded-xl border border-line-strong bg-ink/60 px-4 text-heading tabular-nums focus:border-violet-2 focus:outline-none";
  const blocked = agent.apiPrivate;
  return (
    <section aria-labelledby="franchise-heading" className="rounded-2xl border border-line bg-surface p-7">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 id="franchise-heading" className="text-xl">Franchise</h2>
        <span className="rounded-full border border-amber/35 bg-amber/8 px-3 py-1 text-xs font-semibold text-amber">Test mode · nothing charged</span>
      </div>
      <p className="mb-5 text-[13px] text-muted">
        Let other operators run this agent under their own name and price. They never see your instructions, examples or knowledge base:
        each franchise job runs your agent on VORYNQ&apos;s servers. Each job&apos;s price is split between you, the operator and VORYNQ.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-heading">Allow franchise</span>
          <span className="mt-0.5 block text-xs text-muted">
            {blocked ? "Only public agents can be franchised." : allow ? "Operators can open franchises from the Franchise page." : "Turning it off stops new franchises; open ones keep running until you pause or close them."}
          </span>
        </span>
        <button type="button" role="switch" aria-checked={allow} aria-label="Allow franchise" onClick={toggle} disabled={busy !== null || (blocked && !allow)}
          className={`relative h-7 w-12 flex-none cursor-pointer rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${allow ? "border-violet-2 bg-violet-2" : "border-line-strong bg-surface-2"}`}>
          <span className={`absolute top-0.5 size-[22px] rounded-full bg-white shadow transition-[left] ${allow ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      <form onSubmit={saveSplit} className="mt-4 rounded-xl border border-line px-4 py-3">
        <label htmlFor="fr-pct" className="block text-sm font-semibold text-heading">Your share of each franchise job</label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2">
            <input id="fr-pct" className={field} type="number" min={FRANCHISE.creatorMinPct} max={FRANCHISE.creatorMaxPct} step="1" inputMode="numeric"
              value={pct} onChange={(e) => setPct(e.target.value)} />
            <span className="text-sm text-muted">%</span>
          </span>
          <button type="submit" disabled={busy !== null || !pctValid || pctNumber === savedPct} className="btn btn-ghost btn-sm disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "split" ? "Saving…" : "Save split"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          {pctValid ? <><SplitLine creatorPct={pctNumber} />.</> : `Use ${FRANCHISE.creatorMinPct}–${FRANCHISE.creatorMaxPct}%.`}
          {" "}VORYNQ&apos;s {FRANCHISE.protocolPct}% is fixed. A new split applies to jobs hired after you save it.
        </p>
      </form>

      {error && <p role="alert" className="mt-4 text-sm text-[#ff7e80]">{error}</p>}

      <h3 className="mt-6 mb-3 text-base font-semibold text-heading">Franchises of this agent</h3>
      {list === null && !error && <p className="text-sm text-muted">Loading…</p>}
      {list?.length === 0 && <p className="text-sm text-muted">No franchises yet.{allow ? "" : " Turn on Allow franchise to let operators open one."}</p>}
      <ul className="space-y-2">
        {list?.map((f) => (
          <li key={f.slug} className="rounded-xl border border-line px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href={`/agents/${f.slug}`} className="flex min-w-0 items-center gap-3 font-semibold text-heading hover:text-violet-2">
                <AgentAvatar name={f.name} slug={f.slug} logoAt={f.logoAt} className="size-8 rounded-lg text-[11px]" />
                <span className="truncate">{f.name}</span>
              </Link>
              <FranchiseStatusPill status={f.status} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px] sm:grid-cols-4">
              <div><dt className="text-xs text-muted">Operator</dt><dd className="font-mono text-heading" title={f.operator ?? undefined}>{f.operator ? shortAddress(f.operator) : "–"}</dd></div>
              <div><dt className="text-xs text-muted">Price</dt><dd className="text-heading tabular-nums">${formatUsdc(f.priceUsdc)}</dd></div>
              <div><dt className="text-xs text-muted">Jobs done</dt><dd className="text-heading tabular-nums">{f.jobsCompleted}{f.lastUsedAt ? <span className="text-muted"> · {timeAgo(f.lastUsedAt)}</span> : null}</dd></div>
              <div><dt className="text-xs text-muted">Your share (test)</dt><dd className="font-semibold text-heading tabular-nums">${f.earnings.creatorUsdc.toFixed(4)}</dd></div>
            </dl>
            {f.status !== "revoked" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {f.status === "active" ? (
                  <button type="button" onClick={() => decide(f, "pause")} disabled={busy !== null} className="btn btn-ghost btn-sm disabled:cursor-wait disabled:opacity-60">
                    {busy === `pause:${f.slug}` ? "Pausing…" : "Pause"}
                  </button>
                ) : (
                  <button type="button" onClick={() => decide(f, "resume")} disabled={busy !== null} className="btn btn-ghost btn-sm disabled:cursor-wait disabled:opacity-60">
                    {busy === `resume:${f.slug}` ? "Resuming…" : "Resume"}
                  </button>
                )}
                <button type="button" onClick={() => decide(f, "revoke")} disabled={busy !== null}
                  className="btn btn-sm border-magenta/40 text-magenta hover:bg-magenta/10 disabled:cursor-wait disabled:opacity-60">
                  {busy === `revoke:${f.slug}` ? "Closing…" : "Close for good"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">Paused and closed franchises take no new jobs. Shares count succeeded jobs only and are recorded in test mode: nothing has been charged or paid out.</p>
    </section>
  );
}
