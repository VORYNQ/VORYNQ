"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { JobStatus, OwnerJob, RequestFilters } from "@/shared/types";
import { LIMITS } from "@/shared/catalog";
import { ExampleFields } from "../components/ExamplesPanel";
import { RefreshOnSignIn } from "../components/RefreshOnSignIn";
import { ConnectWallet } from "../components/layout/ConnectWallet";
import { HeroGlow } from "../components/layout/PageHero";
import { Icon } from "../components/ui/Icon";
import { Markdown } from "../components/ui/Markdown";
import { StatusPill, timeAgo } from "../components/ui/JobStatus";
import { NetworkCanvas } from "../components/visual/NetworkCanvas";
import { ApiRequestError, api, formatUsdc } from "../lib/api";
import { shortAddress } from "../shared/address";

const POLL_MS = 3000;
// Keep in sync with JOB_MAX_ATTEMPTS on the server.
const MAX_ATTEMPTS = 5;

const STATUS_OPTIONS: { value: "" | JobStatus; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "succeeded", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Working" },
  { value: "queued", label: "Queued" },
];

const field = "h-10 rounded-xl border border-line bg-ink/60 px-3 text-sm text-heading focus:border-violet-2 focus:outline-none";

const duration = (j: OwnerJob) => {
  if (!j.finishedAt) return null;
  const s = Math.max(0, Math.round((Date.parse(j.finishedAt) - Date.parse(j.queuedAt)) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

const message = (err: unknown) => (err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");

/** Expanded view of one request: full text, details, private note and owner actions. */
function RequestDetail({ job, onChanged }: { job: OwnerJob; onChanged: () => void }) {
  const [note, setNote] = useState(job.note ?? "");
  const [busy, setBusy] = useState<"note" | "review" | "rerun" | "cancel" | "example" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // "Save as example": the owner edits a copy of the job before it trains the agent.
  const [example, setExample] = useState<{ input: string; output: string } | null>(null);
  const [exampleSaved, setExampleSaved] = useState(false);
  useEffect(() => setNote(job.note ?? ""), [job.note]);

  async function act(kind: NonNullable<typeof busy>, run: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    setSaved(false);
    try {
      await run();
      if (kind === "note") setSaved(true);
      onChanged();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  }

  const active = job.status === "queued" || job.status === "running";
  const canRerun = job.status === "failed" && job.attempts < MAX_ATTEMPTS;
  const took = duration(job);

  return (
    <div className="space-y-5 border-t border-line px-4 pt-4 pb-5 sm:px-5">
      <div>
        <h3 className="mb-1.5 text-xs font-semibold tracking-[0.08em] text-muted uppercase">Request</h3>
        <p className="text-sm whitespace-pre-wrap text-heading">{job.input}</p>
      </div>
      {job.output && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-[0.08em] text-muted uppercase">Answer</h3>
          <Markdown text={job.output} className="max-h-80 overflow-y-auto rounded-xl border border-line bg-ink-2 p-4 text-sm" />
        </div>
      )}
      {job.error && <p role="status" className="rounded-xl border border-[#ff7e80]/40 bg-[#ff7e80]/10 px-4 py-3 text-sm text-[#ff7e80]">{job.error}</p>}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted">Received</dt><dd className="text-heading" title={job.createdAt}>{new Date(job.createdAt).toLocaleString()}</dd></div>
        <div><dt className="text-xs text-muted">Time taken</dt><dd className="text-heading">{took ?? "–"}</dd></div>
        <div><dt className="text-xs text-muted">Price</dt><dd className="text-heading">${formatUsdc(job.priceUsdc)} <span className="text-xs text-muted">(test)</span></dd></div>
        <div><dt className="text-xs text-muted">Customer</dt><dd className="font-mono text-[13px] text-heading" title={job.clientAddress ?? undefined}>{job.clientAddress ? shortAddress(job.clientAddress) : "Not signed in"}</dd></div>
        <div><dt className="text-xs text-muted">Tools used</dt><dd className="text-heading">{job.toolsUsed.length ? job.toolsUsed.join(", ") : "none"}</dd></div>
        <div><dt className="text-xs text-muted">Tokens</dt><dd className="text-heading tabular-nums">{(job.inputTokens + job.outputTokens).toLocaleString()}</dd></div>
        <div><dt className="text-xs text-muted">Attempts</dt><dd className="text-heading">{job.attempts} of {MAX_ATTEMPTS}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-muted">Job id</dt><dd className="truncate font-mono text-[12px] text-body" title={job.id}>{job.id}</dd></div>
      </dl>

      <div>
        <label htmlFor={`note-${job.id}`} className="mb-1.5 block text-xs font-semibold tracking-[0.08em] text-muted uppercase">Private note</label>
        <textarea id={`note-${job.id}`} value={note} maxLength={1000} rows={2} onChange={(e) => { setNote(e.target.value); setSaved(false); }}
          placeholder="Only you see this, e.g. VIP customer, follow up"
          className="w-full resize-y rounded-xl border border-line bg-ink/60 px-3 py-2 text-sm text-heading placeholder:text-muted focus:border-violet-2 focus:outline-none" />
      </div>

      {example && (
        <form className="rounded-xl border border-violet-2/35 bg-violet-2/6 p-4" onSubmit={(e) => {
          e.preventDefault();
          act("example", async () => {
            await api.addExample(job.agentSlug, { ...example, sourceJobId: job.id });
            setExample(null);
            setExampleSaved(true);
          });
        }}>
          <p className="mb-3 text-[13px] text-heading">
            Edit it into the answer you want the agent to give. <strong>Remove names, wallet addresses and anything else personal</strong>: examples shape the agent&apos;s answers to every customer.
          </p>
          <ExampleFields idPrefix={`save-${job.id}`} input={example.input} output={example.output}
            onInput={(v) => setExample((x) => x && { ...x, input: v })} onOutput={(v) => setExample((x) => x && { ...x, output: v })} />
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={busy !== null || !example.input.trim() || !example.output.trim()} className="btn btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-50">
              {busy === "example" ? "Saving…" : "Save example"}
            </button>
            <button type="button" onClick={() => setExample(null)} className="btn btn-ghost btn-sm">Cancel</button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="text-sm text-[#ff7e80]">{error}</p>}
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" disabled={busy !== null || note.trim() === (job.note ?? "")} onClick={() => act("note", () => api.updateJob(job.id, { note }))}
          className="btn btn-ghost btn-sm disabled:cursor-not-allowed disabled:opacity-50">{busy === "note" ? "Saving…" : saved ? "Note saved" : "Save note"}</button>
        <button type="button" disabled={busy !== null} onClick={() => act("review", () => api.updateJob(job.id, { reviewed: !job.reviewedAt }))}
          className="btn btn-ghost btn-sm disabled:cursor-wait disabled:opacity-60">
          <Icon name="check" className="size-4" /> {busy === "review" ? "Saving…" : job.reviewedAt ? "Mark as not checked" : "Mark as checked"}
        </button>
        {job.status === "succeeded" && job.output && !example && (
          <button type="button" disabled={busy !== null || exampleSaved} onClick={() => setExample({ input: job.input.slice(0, LIMITS.exampleInputMax), output: job.output!.slice(0, LIMITS.exampleOutputMax) })}
            title="Copy this job into the agent's training examples, after you edit it"
            className="btn btn-ghost btn-sm disabled:cursor-not-allowed disabled:opacity-60">
            <Icon name="spark" className="size-4" /> {exampleSaved ? "Saved as example" : "Save as example"}
          </button>
        )}
        {job.status === "failed" && (
          <button type="button" disabled={busy !== null || !canRerun} onClick={() => act("rerun", () => api.rerunJob(job.id))}
            title={canRerun ? "Runs the same request again. The customer's link shows the new result." : `This request has already been tried ${MAX_ATTEMPTS} times.`}
            className="btn btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-50">
            <Icon name="refresh" className="size-4" /> {busy === "rerun" ? "Starting…" : "Run again"}
          </button>
        )}
        {active && (
          <button type="button" disabled={busy !== null} onClick={() => { if (window.confirm("Stop this job? The customer will see it as cancelled.")) act("cancel", () => api.cancelJob(job.id)); }}
            className="btn btn-sm border-magenta/40 text-magenta hover:bg-magenta/10 disabled:cursor-wait disabled:opacity-60">{busy === "cancel" ? "Stopping…" : "Cancel job"}</button>
        )}
        <Link href={`/agents/${job.agentSlug}`} className="ml-auto text-sm text-muted hover:text-heading">Open agent page</Link>
      </div>
    </div>
  );
}

/** /agents/launcher/requests: the owner's inbox of jobs across all their agents. */
export default function Requests({ agents, initialAgent }: { agents: { slug: string; name: string }[] | null; initialAgent?: string }) {
  const [filters, setFilters] = useState<RequestFilters>(initialAgent ? { agent: initialAgent } : {});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ jobs: OwnerJob[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!agents) return;
    api.requests(filters, page).then((r) => { setData(r); setError(null); }, (err) => setError(message(err)));
  }, [agents, filters, page]);

  useEffect(load, [load]);

  // Search as you type, after a short pause.
  useEffect(() => {
    const t = window.setTimeout(() => setFilters((f) => (f.q === (search.trim() || undefined) ? f : { ...f, q: search.trim() || undefined })), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  // Keep unfinished jobs moving on screen.
  const anyActive = data?.jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    if (!anyActive) return;
    const t = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(t);
  }, [anyActive, load]);

  const set = (patch: Partial<RequestFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const filtered = Object.values(filters).some(Boolean);
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
          <span aria-current="page" className="text-heading">Requests</span>
        </nav>

        {!agents ? (
          <div className="mx-auto mt-6 max-w-[560px] rounded-3xl border border-line bg-ink-2/95 px-8 py-14 text-center backdrop-blur-xl max-sm:px-5">
            <span className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-violet-2/15 text-violet-2"><Icon name="wallet" className="size-7" /></span>
            <h1 className="text-[clamp(26px,3vw,36px)]">Connect your wallet to see your requests</h1>
            <p className="mx-auto mt-3 max-w-[440px] text-[16px]">Requests are private to the wallet that owns the agents.</p>
            <ConnectWallet className="mx-auto mt-7 w-fit" />
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-[clamp(30px,3.4vw,46px)]">Your <span className="grad-text">requests.</span></h1>
                <p className="mt-2 max-w-[640px] text-[17px]">Every job sent to your agents. Only you can see this page.</p>
              </div>
              {data && data.total > 0 && (
                <a href={api.requestsCsvUrl(filters)} download className="btn btn-ghost btn-sm"><Icon name="columns" className="size-4" /> Export CSV</a>
              )}
            </div>

            <div className="rounded-3xl border border-line bg-ink-2/95 p-3 shadow-[0_40px_120px_-60px_rgb(112_40_228/0.6)] backdrop-blur-xl sm:p-4">
              {/* Filters in one row above the list. */}
              <div className="mb-4 flex flex-wrap items-center gap-2.5">
                <label className="relative min-w-[200px] flex-[2_1_240px]">
                  <span className="sr-only">Search requests, answers and notes</span>
                  <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search requests, answers, notes…" className={`${field} w-full pl-10`} />
                </label>
                <label className="flex-[1_1_150px]"><span className="sr-only">Status</span>
                  <select value={filters.status ?? ""} onChange={(e) => set({ status: (e.target.value || undefined) as JobStatus | undefined })} className={`${field} w-full`}>
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="flex-[1_1_150px]"><span className="sr-only">Agent</span>
                  <select value={filters.agent ?? ""} onChange={(e) => set({ agent: e.target.value || undefined })} className={`${field} w-full`}>
                    <option value="">All agents</option>
                    {agents.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                  </select>
                </label>
                <label className="flex-[1_1_150px]"><span className="sr-only">Checked</span>
                  <select value={filters.reviewed ?? ""} onChange={(e) => set({ reviewed: (e.target.value || undefined) as RequestFilters["reviewed"] })} className={`${field} w-full`}>
                    <option value="">Checked or not</option>
                    <option value="no">Not checked yet</option>
                    <option value="yes">Checked</option>
                  </select>
                </label>
                <label className="flex flex-[1_1_140px] items-center gap-2 text-xs text-muted">From
                  <input type="date" value={filters.from ?? ""} max={filters.to} onChange={(e) => set({ from: e.target.value || undefined })} className={`${field} w-full`} />
                </label>
                <label className="flex flex-[1_1_140px] items-center gap-2 text-xs text-muted">To
                  <input type="date" value={filters.to ?? ""} min={filters.from} onChange={(e) => set({ to: e.target.value || undefined })} className={`${field} w-full`} />
                </label>
                {filtered && (
                  <button type="button" onClick={() => { setSearch(""); setFilters({}); setPage(1); }} className="h-10 cursor-pointer px-2 text-sm text-muted hover:text-heading">Clear</button>
                )}
              </div>

              {error && <p role="alert" className="mb-3 text-sm text-[#ff7e80]">{error}</p>}

              {!data ? (
                <p className="px-2 py-10 text-center text-sm text-muted">Loading requests…</p>
              ) : data.jobs.length === 0 ? (
                <div role="status" className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
                  <p className="text-heading">{filtered ? "No requests match these filters." : agents.length ? "No requests yet. They appear here as soon as someone hires your agents." : "You have no agents yet."}</p>
                  {!agents.length && <Link href="/agents/launcher/new" className="btn btn-primary btn-sm mt-5">Launch an agent</Link>}
                </div>
              ) : (
                <ul className="space-y-2">
                  {data.jobs.map((j) => {
                    const expanded = open === j.id;
                    return (
                      <li key={j.id} className={`overflow-hidden rounded-xl border bg-surface ${expanded ? "border-violet-2/50" : "border-line"}`}>
                        <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : j.id)}
                          className="flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition-colors hover:bg-surface-2 sm:px-5">
                          <span className={`grid size-6 flex-none place-items-center rounded-full border ${j.reviewedAt ? "border-mint/50 bg-mint/12 text-mint" : "border-line text-transparent"}`}
                            title={j.reviewedAt ? "Checked" : "Not checked yet"}>
                            <Icon name="check" className="size-3.5" /><span className="sr-only">{j.reviewedAt ? "Checked" : "Not checked"}</span>
                          </span>
                          <span className="min-w-0 flex-[1_1_240px]">
                            <span className="block truncate text-sm text-heading">{j.input}</span>
                            <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                              <span>{j.agentName}</span>
                              {j.attempts > 1 && <span>· tried {j.attempts}×</span>}
                              {j.note && <span title={j.note}>· has a note</span>}
                            </span>
                          </span>
                          <span className="ml-auto flex flex-none items-center gap-3">
                            <span className="text-xs text-muted" title={j.createdAt}>{timeAgo(j.createdAt)}</span>
                            <StatusPill status={j.status} />
                          </span>
                        </button>
                        {expanded && <RequestDetail job={j} onChanged={load} />}
                      </li>
                    );
                  })}
                </ul>
              )}

              {data && data.total > data.pageSize && (
                <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted tabular-nums">{from}–{to} of {data.total.toLocaleString()}</span>
                  <span className="flex gap-2">
                    <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn btn-ghost btn-sm disabled:opacity-50">Previous</button>
                    <button type="button" disabled={to >= data.total} onClick={() => setPage((p) => p + 1)} className="btn btn-ghost btn-sm disabled:opacity-50">Next</button>
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
