"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { JOB_LIMITS, LIMITS, MODELS, TOOLS } from "@/shared/catalog";
import type { AgentPerformance, AgentPublic, Job, UsageDay } from "@/shared/types";
import { PerformancePanel } from "../components/AgentPerformance";
import { UsageChart } from "../components/UsageChart";
import { HeroGlow } from "../components/layout/PageHero";
import { AgentAvatar } from "../components/ui/AgentAvatar";
import { CategoryBadge, TagChip } from "../components/ui/CategoryBadge";
import { OfficialBadge } from "../components/ui/OfficialBadge";
import { StatusPill, timeAgo } from "../components/ui/JobStatus";
import { NetworkCanvas } from "../components/visual/NetworkCanvas";
import { ApiRequestError, api, formatUsdc, ownerTokens, type Meta } from "../lib/api";
import { RefreshOnSignIn } from "../components/RefreshOnSignIn";
import { AccessRequestPanel } from "../components/AccessRequestPanel";
import { ApiAccessPanel } from "../components/ApiAccessPanel";
import { ExamplesPanel } from "../components/ExamplesPanel";
import { FranchisePanel, FranchiseStatusPill } from "../components/FranchisePanel";
import { KnowledgePanel } from "../components/KnowledgePanel";
import { Icon } from "../components/ui/Icon";
import { Markdown, plainText } from "../components/ui/Markdown";
import { PrivacyNote } from "../components/PrivacyNote";
import { useAuth } from "../lib/auth";

const POLL_MS = 1500;
// Keep in sync with THREAD_HISTORY_JOBS on the server.
const THREAD_MEMORY = 5;

/** Polls a job until it reaches a final status (succeeded or failed), retrying through network errors. */
function useJob(initial: Job | null) {
  const [job, setJob] = useState<Job | null>(initial);
  const timer = useRef<number | undefined>(undefined);
  const tracking = useRef<string | null>(null);

  const track = useCallback((j: Job | null) => {
    window.clearTimeout(timer.current);
    tracking.current = j?.id ?? null;
    setJob(j);
    if (!j || j.status === "succeeded" || j.status === "failed") return;
    const tick = async () => {
      try {
        const next = await api.getJob(j.id);
        // A reply for a job the user has since replaced must not overwrite the new one.
        if (tracking.current !== j.id) return;
        setJob(next);
        if (next.status === "queued" || next.status === "running") timer.current = window.setTimeout(tick, POLL_MS);
      } catch {
        if (tracking.current === j.id) timer.current = window.setTimeout(tick, POLL_MS * 2);
      }
    };
    timer.current = window.setTimeout(tick, POLL_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [job, track] as const;
}

function JobPanel({ agent, meta, job, onJob, question }: { agent: AgentPublic; meta: Meta | null; job: Job | null; onJob: (j: Job) => void; question: string }) {
  const auth = useAuth();
  // Starts with the question from a link such as /agents/finance's examples (?q=…), which the customer can still edit.
  const [input, setInput] = useState(question);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The conversation being continued and its earlier finished jobs (shown above the form).
  const [thread, setThread] = useState<{ id: string; turns: Job[] } | null>(null);
  const busy = sending || job?.status === "queued" || job?.status === "running";
  // Once continued, the last job moves into the conversation list instead of showing twice.
  const showJob = job && !thread?.turns.some((t) => t.id === job.id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      onJob(await api.runJob(agent.slug, input, thread?.id));
      setInput("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not start the job.");
    } finally {
      setSending(false);
    }
  }

  function continueWith(j: Job) {
    setThread((t) => ({ id: j.threadId!, turns: [...(t?.id === j.threadId ? t.turns : []), j] }));
    setInput("");
    setError(null);
  }

  async function forget() {
    if (!thread || !window.confirm("Forget this conversation? The agent will no longer remember it.")) return;
    try {
      await api.forgetThread(agent.slug, thread.id);
      setThread(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not forget the conversation.");
    }
  }

  return (
    <section id="hire" aria-labelledby="hire-heading" className="glass-card scroll-mt-28 hover:translate-y-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 id="hire-heading" className="text-[26px]">Hire this agent</h2>
        <span className="rounded-full border border-amber/35 bg-amber/8 px-3 py-1 text-xs font-semibold text-amber">Test mode · not charged</span>
      </div>

      {meta && !meta.credentialsConfigured && (
        <p className="mb-5 rounded-xl border border-amber/35 bg-amber/8 px-4 py-3 text-sm text-amber">
          This server has no DEEPSEEK_API_KEY set, so jobs will fail. Add it to <code className="font-mono">.env.local</code> and restart the server.
        </p>
      )}

      {thread && (
        <div className="mb-5 rounded-xl border border-violet-2/35 bg-violet-2/6 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-heading">Conversation · the agent remembers your last {Math.min(thread.turns.length, THREAD_MEMORY)} {thread.turns.length === 1 ? "job" : "jobs"}</span>
            <span className="flex gap-3 text-[13px]">
              <a href={api.threadUrl(agent.slug, thread.id)} download={`${agent.slug}-conversation.json`} className="text-violet-2 hover:underline">Download</a>
              <button type="button" onClick={forget} className="cursor-pointer text-magenta hover:underline">Forget</button>
              <button type="button" onClick={() => setThread(null)} className="cursor-pointer text-muted hover:text-heading hover:underline">New conversation</button>
            </span>
          </div>
          <ol className="max-h-[260px] space-y-3 overflow-y-auto">
            {thread.turns.map((t) => (
              <li key={t.id} className="text-[13px]">
                <p className="line-clamp-2 text-heading"><span className="font-semibold">You:</span> {t.input}</p>
                <p className="mt-0.5 line-clamp-3 text-body"><span className="font-semibold text-heading">Agent:</span> {plainText(t.output ?? "")}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <form onSubmit={submit} noValidate>
        <label htmlFor="job-input" className="mb-2 block text-sm font-medium text-heading">{thread ? "Follow-up" : "Describe the job"}</label>
        <textarea id="job-input" rows={5} value={input} maxLength={LIMITS.jobInputMax} onChange={(e) => setInput(e.target.value)}
          placeholder="Tell the agent exactly what you need. Include links, numbers and the format you want back."
          className="w-full resize-y rounded-xl border border-line-strong bg-ink/60 px-4 py-3 leading-relaxed text-heading placeholder:text-muted focus:border-violet-2 focus:outline-none" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <span className="text-sm text-muted">
            Price: <strong className="font-semibold text-heading">${formatUsdc(agent.priceUsdc)}</strong> per job, in stablecoins
          </span>
          <button type="submit" disabled={busy || !input.trim()} className="btn btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "Running…" : "Run job"}
          </button>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-[#ff7e80]">{error}</p>}
        <PrivacyNote agent={agent} className="mt-4" />
      </form>

      {job && showJob && (
        <div aria-live="polite" className="mt-7 border-t border-line pt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <StatusPill status={job.status} />
            <span className="font-mono text-xs text-muted">job {job.id.slice(0, 8)} · {timeAgo(job.createdAt)}</span>
          </div>
          {job.status === "succeeded" && job.output && (
            <Markdown text={job.output} className="job-output max-h-[560px] overflow-y-auto rounded-xl border border-line bg-ink-2 p-5 text-[15px] leading-relaxed text-heading" />
          )}
          {job.status === "failed" && <p className="rounded-xl border border-[#ff7e80]/40 bg-[#ff7e80]/10 px-4 py-3 text-sm text-[#ffb0b2]">{job.error}</p>}
          {(job.status === "queued" || job.status === "running") && (
            <p className="text-sm text-muted">The agent is working on it. Jobs that use web tools can take a minute.</p>
          )}
          {(job.status === "succeeded" || job.status === "failed") && (
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted">
              <div>Tools used: <span className="text-body">{job.toolsUsed.length ? job.toolsUsed.join(", ") : "none"}</span></div>
              <div>Tokens: <span className="text-body">{job.inputTokens.toLocaleString()} in / {job.outputTokens.toLocaleString()} out</span></div>
              <div>Price: <span className="text-body">${formatUsdc(job.priceUsdc)} (test mode)</span></div>
            </dl>
          )}
          {job.status === "succeeded" && (
            job.threadId ? (
              <button type="button" onClick={() => continueWith(job)} className="btn btn-ghost btn-sm mt-5">
                <Icon name="refresh" className="size-4" /> Continue this conversation
              </button>
            ) : !auth.address && (
              <p className="mt-5 text-[13px] text-muted">Sign in with your wallet to continue conversations: the agent then remembers your earlier jobs.</p>
            )
          )}
        </div>
      )}
    </section>
  );
}

/** Owner-only: edit the agent's public details and price, or delete it. The server checks ownership again. */
function OwnerPanel({ agent }: { agent: AgentPublic }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description);
  const [price, setPrice] = useState(formatUsdc(agent.priceUsdc));
  const usesWebhook = agent.tools.includes("send_webhook");
  const [webhookUrl, setWebhookUrl] = useState(agent.webhookUrl ?? "");
  const [notifyUrl, setNotifyUrl] = useState(agent.notifyUrl ?? "");
  // Empty means the platform default.
  const [agentCap, setAgentCap] = useState(agent.dailyJobLimit?.toString() ?? "");
  const [customerCap, setCustomerCap] = useState(agent.customerDailyLimit?.toString() ?? "");
  const [busy, setBusy] = useState<"save" | "delete" | "logo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError(null);
    try {
      await api.updateAgent(agent.slug, {
        name, description, priceUsdc: Math.round(Number(price) * 100) / 100, notifyUrl, ...(usesWebhook ? { webhookUrl } : {}),
        dailyJobLimit: agentCap.trim() ? Number(agentCap) : null,
        customerDailyLimit: customerCap.trim() ? Number(customerCap) : null,
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? Object.values(err.fields ?? {})[0] ?? err.message : "Could not save. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function newLogo() {
    setBusy("logo");
    setError(null);
    try {
      await api.regenerateLogo(agent.slug);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not make a new logo. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const franchiseNote = agent.allowFranchise ? " Any franchises of it are closed too." : "";
    if (!window.confirm(`Delete ${agent.name}? Its service page, API endpoint and job history are removed for good.${franchiseNote}`)) return;
    setBusy("delete");
    setError(null);
    try {
      await api.deleteAgent(agent.slug);
      router.push("/agents/launcher");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not delete. Please try again.");
      setBusy(null);
    }
  }

  const field = "h-11 w-full rounded-xl border border-line-strong bg-ink/60 px-4 text-heading focus:border-violet-2 focus:outline-none";
  return (
    <section aria-labelledby="manage-heading" className="rounded-2xl border border-line bg-surface p-7">
      <h2 id="manage-heading" className="mb-1 text-xl">{agent.franchise ? "Manage franchise" : "Manage agent"}</h2>
      <p className="mb-5 text-[13px] text-muted">
        {agent.franchise
          ? "You run this franchise with your signed-in wallet. You set its name, description, price and limits; the agent's instructions, tools and training stay with its creator."
          : "You own this agent with your signed-in wallet. Only you can change or delete it."}
        {" "}Limits: {agent.dailyJobLimit ?? JOB_LIMITS.agentDailyDefault} jobs a day, {agent.customerDailyLimit ?? JOB_LIMITS.customerDailyDefault} per customer.
      </p>
      {editing ? (
        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm font-medium text-heading">Name
            <input className={`${field} mt-2`} value={name} maxLength={LIMITS.nameMax} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="block text-sm font-medium text-heading">Short description
            <input className={`${field} mt-2`} value={description} maxLength={LIMITS.descriptionMax} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-heading">Price per job (in stablecoins)
            <input className={`${field} mt-2`} type="number" min="0" max={LIMITS.priceMax} step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </label>
          {usesWebhook && (
            <label className="block text-sm font-medium text-heading">Webhook URL <span className="font-normal text-muted">(private)</span>
              <input className={`${field} mt-2 font-mono text-sm`} type="url" inputMode="url" value={webhookUrl} maxLength={LIMITS.webhookUrlMax} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.example.com/…" required />
            </label>
          )}
          <label className="block text-sm font-medium text-heading">Notifications URL <span className="font-normal text-muted">(optional, private)</span>
            <input className={`${field} mt-2 font-mono text-sm`} type="url" inputMode="url" value={notifyUrl} maxLength={LIMITS.webhookUrlMax} onChange={(e) => setNotifyUrl(e.target.value)} placeholder="https://hooks.example.com/…" />
            <span className="mt-1.5 block text-xs font-normal text-muted">We POST a JSON event here when someone hires this agent (job.created) and when a job fails (job.failed).</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-heading">Jobs per day <span className="font-normal text-muted">(all customers)</span>
              <input className={`${field} mt-2`} type="number" min="1" max={JOB_LIMITS.agentDailyMax} step="1" inputMode="numeric" value={agentCap}
                onChange={(e) => setAgentCap(e.target.value)} placeholder={`Default ${JOB_LIMITS.agentDailyDefault}`} />
              <span className="mt-1.5 block text-xs font-normal text-muted">Up to {JOB_LIMITS.agentDailyMax}. Empty uses the default.</span>
            </label>
            <label className="block text-sm font-medium text-heading">Jobs per customer per day
              <input className={`${field} mt-2`} type="number" min="1" max={JOB_LIMITS.customerDailyMax} step="1" inputMode="numeric" value={customerCap}
                onChange={(e) => setCustomerCap(e.target.value)} placeholder={`Default ${JOB_LIMITS.customerDailyDefault}`} />
              <span className="mt-1.5 block text-xs font-normal text-muted">Up to {JOB_LIMITS.customerDailyMax}. Your own jobs and API keys are not limited by this.</span>
            </label>
          </div>
          {error && <p role="alert" className="text-sm text-[#ff7e80]">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy !== null} className="btn btn-primary btn-sm disabled:cursor-wait disabled:opacity-60">{busy === "save" ? "Saving…" : "Save changes"}</button>
            <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost btn-sm">Cancel</button>
          </div>
        </form>
      ) : (
        <>
          {error && <p role="alert" className="mb-3 text-sm text-[#ff7e80]">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost btn-sm">Edit details</button>
            <button type="button" onClick={newLogo} disabled={busy !== null} className="btn btn-ghost btn-sm disabled:cursor-wait disabled:opacity-60">
              {busy === "logo" ? "Making logo…" : "New logo"}
            </button>
            <button type="button" onClick={remove} disabled={busy !== null}
              className="btn btn-sm border-magenta/40 text-magenta hover:bg-magenta/10 disabled:cursor-wait disabled:opacity-60">
              {busy === "delete" ? "Deleting…" : agent.franchise ? "Delete franchise" : "Delete agent"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function OwnerJobs({ slug, token, refreshKey, onOpen }: { slug: string; token: string | null; refreshKey: string; onOpen: (j: Job) => void }) {
  const [list, setList] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.ownerJobs(slug, token).then(setList, (err) => setError(err instanceof ApiRequestError ? err.message : "Could not load jobs."));
  }, [slug, token, refreshKey]);

  return (
    <section aria-labelledby="owner-heading" className="rounded-2xl border border-line bg-surface p-7">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="owner-heading" className="text-xl">Your recent jobs</h2>
        {!token && <Link href={`/agents/launcher/requests?agent=${encodeURIComponent(slug)}`} className="text-sm text-violet-2 hover:underline">Manage all requests</Link>}
      </div>
      <p className="mb-5 text-[13px] text-muted">Visible only to you, the owner of this agent.</p>
      {error && <p className="text-sm text-[#ff7e80]">{error}</p>}
      {list?.length === 0 && <p className="text-sm text-muted">No jobs yet. Run one to test your agent.</p>}
      <ul className="space-y-2">
        {list?.map((j) => (
          <li key={j.id}>
            <button type="button" onClick={() => onOpen(j)}
              className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:bg-surface-2">
              <span className="min-w-0 truncate text-sm text-heading">{j.input}</span>
              <span className="flex flex-none items-center gap-3">
                <span className="text-xs text-muted">{timeAgo(j.createdAt)}</span>
                <StatusPill status={j.status} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Under a franchise's name: which agent it runs, and its status when it is not open. */
function FranchiseLine({ franchise }: { franchise: NonNullable<AgentPublic["franchise"]> }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
      <p className="flex min-w-0 items-start gap-2">
        <Icon name="building" className="mt-0.5 size-4 flex-none text-violet-2" />
        {franchise.parent ? (
          <span>Franchise of <Link href={`/agents/${franchise.parent.slug}`} className="font-semibold text-heading hover:text-violet-2">{franchise.parent.name}</Link>, run by an independent operator</span>
        ) : (
          <span>Franchise of an agent that is no longer on VORYNQ</span>
        )}
      </p>
      {franchise.status !== "active" && <FranchiseStatusPill status={franchise.status} />}
    </div>
  );
}

/** Shown instead of the hire form while a franchise takes no jobs. */
function FranchiseClosed({ agent }: { agent: AgentPublic }) {
  const f = agent.franchise!;
  const paused = f.status === "paused" && f.parent !== null;
  return (
    <section aria-labelledby="hire-heading" className="glass-card hover:translate-y-0">
      <h2 id="hire-heading" className="mb-3 text-[26px]">{paused ? "Paused for now" : "This franchise is closed"}</h2>
      <p className="text-body">
        {paused ? "The creator of the original agent has paused this franchise, so it takes no new jobs right now." : "It no longer takes jobs."}
        {f.parent && <> You can still hire <Link href={`/agents/${f.parent.slug}`} className="text-violet-2 hover:underline">{f.parent.name}</Link> directly.</>}
      </p>
    </section>
  );
}

/** Service page body. The agent is loaded on the server (src/app/agents/[slug]/page.tsx). */
export default function AgentService({ agent, performance, usage, justCreated, question = "" }: { agent: AgentPublic; performance: AgentPerformance; usage: { days: UsageDay[]; today: string } | null; justCreated: boolean; question?: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [job, trackJob] = useJob(null);
  // Browser-only values, read after hydration so server and client render the same first frame.
  const [token, setToken] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setToken(ownerTokens.get(agent.slug));
    setOrigin(window.location.origin);
    api.meta().then(setMeta, () => setMeta(null));
  }, [agent.slug]);

  const isOwner = agent.isOwner === true;
  // A paused or closed franchise (or one whose original agent is gone) takes no jobs.
  const closed = agent.franchise !== null && (agent.franchise.status !== "active" || agent.franchise.parent === null);

  const model = MODELS.find((m) => m.id === agent.model);
  const endpoint = `${origin}/api/agents/${agent.slug}/jobs`;

  return (
    <>
      <RefreshOnSignIn />
      <section className="relative overflow-hidden pt-[150px] pb-14 max-sm:pt-[120px]">
        <NetworkCanvas />
        <HeroGlow />
        <div className="container-x relative z-[2]">
          <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap gap-2 font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
            <Link href="/agents" className="hover:text-heading">Agents</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="text-heading">{agent.name}</span>
          </nav>

          {justCreated && (
            <p role="status" className="mb-8 rounded-xl border border-mint/35 bg-mint/8 px-5 py-4 text-sm text-mint">
              {agent.franchise
                ? "Your franchise is live. It is saved to your wallet: sign in with the same wallet in any browser to manage it, or see it on the Franchise page."
                : "Your agent is live. It is saved to your wallet: sign in with the same wallet in any browser to manage it."}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-6">
            <AgentAvatar name={agent.name} slug={agent.slug} logoAt={agent.logoAt} className="size-20 rounded-3xl text-2xl" />
            {/* Full width on phones, so a long description is not squeezed between the logo and the price. */}
            <div className="min-w-0 flex-1 max-sm:basis-full">
              <h1 className="text-[clamp(34px,4.6vw,56px)]">{agent.name}</h1>
              {agent.official && <OfficialBadge className="mt-3" />}
              {agent.franchise && <FranchiseLine franchise={agent.franchise} />}
              {agent.description && <p className="mt-2 max-w-[720px] text-lg">{agent.description}</p>}
            </div>
            <div className="text-right max-sm:text-left">
              <div className="text-[40px] leading-none font-semibold text-heading">${formatUsdc(agent.priceUsdc)}</div>
              <div className="mt-1 text-sm text-muted">per job, in stablecoins</div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <CategoryBadge category={agent.category} className="px-3.5 py-1.5 text-sm" />
            {agent.tags.map((t) => <TagChip key={t}>{t}</TagChip>)}
          </div>

          <div className="mt-3 flex flex-wrap gap-2.5">
            <span className="rounded-full border border-violet-2/40 bg-violet-2/10 px-3.5 py-1.5 text-sm text-heading">{model?.label ?? agent.model}</span>
            {TOOLS.filter((t) => agent.tools.includes(t.id)).map((t) => (
              <span key={t.id} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm">{t.label}</span>
            ))}
            <span className="rounded-full border border-line px-3.5 py-1.5 text-sm text-muted">{agent.jobsCompleted} {agent.jobsCompleted === 1 ? "job" : "jobs"} completed</span>
            {agent.apiPrivate && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/8 px-3.5 py-1.5 text-sm text-amber">
                <Icon name="shield" className="size-3.5" /> Private API
              </span>
            )}
            {agent.allowFranchise && !agent.apiPrivate && !agent.official && !agent.franchise && !isOwner && (
              <Link href={`/agents/launcher/franchise?agent=${encodeURIComponent(agent.slug)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-violet-2/40 bg-violet-2/10 px-3.5 py-1.5 text-sm text-heading hover:border-violet-2">
                <Icon name="building" className="size-3.5 text-violet-2" /> Open a franchise
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="pb-[120px]">
        <div className="container-x grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="min-w-0 space-y-8">
            {closed ? (
              <FranchiseClosed agent={agent} />
            ) : agent.apiPrivate && !isOwner ? (
              <AccessRequestPanel agent={agent} />
            ) : (
              <JobPanel agent={agent} meta={meta} job={job} onJob={trackJob} question={question} />
            )}
            {isOwner && <OwnerPanel agent={agent} />}
            {isOwner && usage && <UsageChart days={usage.days} today={usage.today} title="Usage & revenue" note="Only you see this. Revenue counts the price of succeeded jobs (test mode: nothing charged yet). Days are in UTC." />}
            {/* A franchise runs its creator's training and keeps the API public, so it has none of these panels. */}
            {isOwner && !agent.franchise && <KnowledgePanel slug={agent.slug} />}
            {isOwner && !agent.franchise && <ExamplesPanel slug={agent.slug} />}
            {isOwner && !agent.franchise && <ApiAccessPanel agent={agent} />}
            {isOwner && !agent.franchise && !agent.official && <FranchisePanel agent={agent} />}
            {(isOwner || token) && <OwnerJobs slug={agent.slug} token={isOwner ? null : token} refreshKey={`${job?.id}:${job?.status}`} onOpen={trackJob} />}
          </div>

          <aside className="min-w-0 space-y-8">
            <PerformancePanel performance={performance} />
            <section id="api" aria-labelledby="api-heading" className="scroll-mt-28 rounded-2xl border border-line bg-surface p-7">
              <h2 id="api-heading" className="mb-1 text-xl">Use it from code</h2>
              <p className="mb-5 text-[13px] text-muted">
                Start a job, then poll it until its status is completed or failed.{agent.apiPrivate ? " This agent is private: send one of its API keys." : ""}
              </p>
              <pre className="overflow-x-auto rounded-xl border border-line bg-ink-2 p-4 font-mono text-[12.5px] leading-relaxed text-body">
{`curl -X POST ${endpoint} \\
  -H "content-type: application/json" \\${agent.apiPrivate ? `
  -H "authorization: Bearer vrq_YOUR_KEY" \\` : ""}
  -d '{"input": "Your job here"}'

curl ${origin}/api/jobs/<job id>`}
              </pre>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-7 text-sm">
              <h2 className="mb-3 text-xl">How payment works</h2>
              <p>Each completed job is priced at ${formatUsdc(agent.priceUsdc)}. Stablecoin payments over x402-compatible rails are not live yet, so jobs currently run in test mode and nothing is charged.</p>
            </section>
          </aside>
        </div>
      </section>
    </>
  );
}
