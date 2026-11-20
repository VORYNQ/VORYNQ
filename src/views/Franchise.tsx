"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LIMITS } from "@/shared/catalog";
import { FRANCHISE, operatorPct } from "@/shared/franchise";
import type { FranchisableAgent, FranchiseSummary } from "@/shared/types";
import { FranchiseStatusPill, SplitLine } from "../components/FranchisePanel";
import { RefreshOnSignIn } from "../components/RefreshOnSignIn";
import { ConnectWallet } from "../components/layout/ConnectWallet";
import { HeroGlow } from "../components/layout/PageHero";
import { AgentAvatar } from "../components/ui/AgentAvatar";
import { CategoryBadge } from "../components/ui/CategoryBadge";
import { Icon, type IconName } from "../components/ui/Icon";
import { timeAgo } from "../components/ui/JobStatus";
import { NetworkCanvas } from "../components/visual/NetworkCanvas";
import { ApiRequestError, api, formatUsdc } from "../lib/api";
import { shortAddress } from "../shared/address";

const field = "h-11 w-full rounded-xl border border-line-strong bg-ink/60 px-4 text-heading focus:border-violet-2 focus:outline-none";

/** The operator's storefront for a new franchise. Only these three fields are ever sent. */
function OpenForm({ agent, onCancel }: { agent: FranchisableAgent; onCancel: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(formatUsdc(agent.priceUsdc));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const priceNumber = Number(price);
  const share = Number.isFinite(priceNumber) && priceNumber > 0 ? (priceNumber * operatorPct(agent.franchiseCreatorPct)) / 100 : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      const created = await api.openFranchise(agent.slug, { name, description, priceUsdc: Math.round(priceNumber * 100) / 100 });
      router.push(`/agents/${created.slug}?created=1`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) setErrors(err.fields);
      setError(err instanceof ApiRequestError ? (err.fields ? null : err.message) : "Could not open the franchise. Please try again.");
      setBusy(false);
    }
  }

  const id = `fr-${agent.slug}`;
  return (
    <form onSubmit={submit} noValidate className="mt-4 space-y-4 border-t border-line pt-4">
      <label htmlFor={`${id}-name`} className="block text-sm font-medium text-heading">Your franchise name
        <input id={`${id}-name`} className={`${field} mt-2`} value={name} maxLength={LIMITS.nameMax} autoFocus required
          onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${agent.name.split(" ")[0]} Desk`} />
        {errors.name ? <span className="mt-1.5 block text-xs text-[#ff7e80]">{errors.name}</span> : <span className="mt-1.5 block text-xs font-normal text-muted">Must be unique on VORYNQ, like any agent name.</span>}
      </label>
      <label htmlFor={`${id}-desc`} className="block text-sm font-medium text-heading">Short description <span className="font-normal text-muted">(optional)</span>
        <input id={`${id}-desc`} className={`${field} mt-2`} value={description} maxLength={LIMITS.descriptionMax} onChange={(e) => setDescription(e.target.value)} />
        {errors.description && <span className="mt-1.5 block text-xs text-[#ff7e80]">{errors.description}</span>}
      </label>
      <label htmlFor={`${id}-price`} className="block text-sm font-medium text-heading">Your price per job (in stablecoins)
        <input id={`${id}-price`} className={`${field} mt-2`} type="number" min="0" max={LIMITS.priceMax} step="0.01" inputMode="decimal" value={price} required
          onChange={(e) => setPrice(e.target.value)} />
        {errors.priceUsdc
          ? <span className="mt-1.5 block text-xs text-[#ff7e80]">{errors.priceUsdc}</span>
          : <span className="mt-1.5 block text-xs font-normal text-muted">You would keep ${share.toFixed(4)} of each job ({operatorPct(agent.franchiseCreatorPct)}%). Test mode: nothing is charged yet.</span>}
      </label>
      <p className="flex gap-2 text-[13px] text-muted">
        <Icon name="shield" className="mt-0.5 size-3.5 flex-none" />
        <span>Your franchise runs {agent.name}&apos;s instructions, tools and training on VORYNQ&apos;s servers. You never see them, and the creator never sees your customers&apos; jobs.</span>
      </p>
      {error && <p role="alert" className="text-sm text-[#ff7e80]">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy || !name.trim()} className="btn btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Opening…" : "Open franchise"}</button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">Cancel</button>
      </div>
    </form>
  );
}

function AgentCard({ agent, me, mine, open, onOpen, onClose }: {
  agent: FranchisableAgent; me: string | null; mine: FranchiseSummary | undefined; open: boolean; onOpen: () => void; onClose: () => void;
}) {
  const own = me !== null && agent.creator === me;
  return (
    <li id={`agent-${agent.slug}`} className={`scroll-mt-28 rounded-2xl border bg-surface p-5 ${open ? "border-violet-2/60" : "border-line"}`}>
      <div className="flex items-start gap-4">
        <AgentAvatar name={agent.name} slug={agent.slug} logoAt={agent.logoAt} className="size-12 flex-none rounded-2xl text-sm" />
        <div className="min-w-0 flex-1">
          <Link href={`/agents/${agent.slug}`} className="block truncate text-lg font-semibold text-heading hover:text-violet-2">{agent.name}</Link>
          {agent.description && <p className="mt-0.5 line-clamp-2 text-sm">{agent.description}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CategoryBadge category={agent.category} />
        <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">{agent.jobsCompleted} {agent.jobsCompleted === 1 ? "job" : "jobs"} done</span>
        <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">{agent.franchises} {agent.franchises === 1 ? "franchise" : "franchises"}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
        <div><dt className="text-xs text-muted">Creator</dt><dd className="font-mono text-heading" title={agent.creator ?? undefined}>{agent.creator ? shortAddress(agent.creator) : "–"}</dd></div>
        <div><dt className="text-xs text-muted">Creator&apos;s price</dt><dd className="text-heading tabular-nums">${formatUsdc(agent.priceUsdc)}</dd></div>
        <div className="col-span-2"><dt className="text-xs text-muted">Split of each job</dt><dd><SplitLine creatorPct={agent.franchiseCreatorPct} className="text-heading" /></dd></div>
      </dl>
      {open ? (
        <OpenForm agent={agent} onCancel={onClose} />
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {own ? (
            <span className="text-sm text-muted">Your own agent</span>
          ) : mine ? (
            <Link href={`/agents/${mine.slug}`} className="btn btn-ghost btn-sm">You run {mine.name}</Link>
          ) : me ? (
            <button type="button" onClick={onOpen} className="btn btn-primary btn-sm"><Icon name="plus" className="size-4" /> Open a franchise</button>
          ) : (
            <ConnectWallet label="Connect wallet to franchise" />
          )}
        </div>
      )}
    </li>
  );
}

function Fact({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <span className="grid size-10 place-items-center rounded-xl bg-violet-2/15 text-violet-2"><Icon name={icon} className="size-5" /></span>
      <h2 className="mt-3 text-base font-semibold text-heading">{title}</h2>
      <p className="mt-1 text-sm">{body}</p>
    </div>
  );
}

/** /agents/launcher/franchise: operators browse agents open for franchising, open one, and see the franchises they run. */
export default function Franchise({ agents, mine, me, initialAgent }: { agents: FranchisableAgent[]; mine: FranchiseSummary[] | null; me: string | null; initialAgent: string | null }) {
  const [openSlug, setOpenSlug] = useState<string | null>(me && initialAgent && agents.some((a) => a.slug === initialAgent) ? initialAgent : null);
  // Relative times depend on the clock, so they render only in the browser (server and client must match).
  const [mounted, setMounted] = useState(false);
  // Arriving from an agent's "Open a franchise" link: bring its card into view.
  useEffect(() => {
    setMounted(true);
    if (initialAgent) document.getElementById(`agent-${initialAgent}`)?.scrollIntoView({ block: "center" });
  }, [initialAgent]);
  const openByParent = new Map((mine ?? []).filter((f) => f.status !== "revoked" && f.parent).map((f) => [f.parent!.slug, f]));

  return (
    <section className="relative min-h-[80vh] overflow-hidden pt-[110px] pb-20 max-sm:pt-[96px] max-md:pb-14">
      <RefreshOnSignIn />
      <NetworkCanvas />
      <HeroGlow />
      <div className="container-x relative z-[2]">
        <nav aria-label="Breadcrumb" className="mb-2 flex gap-2 font-mono text-[12px] tracking-[0.08em] text-muted uppercase">
          <Link href="/agents/launcher" className="hover:text-heading">Dashboard</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-heading">Franchise</span>
        </nav>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[clamp(30px,3.4vw,46px)]">Agent <span className="grad-text">franchise.</span></h1>
            <p className="mt-2 max-w-[660px] text-[17px]">Run a proven agent under your own name and price. The creator keeps their know-how private and earns a share of every job you sell.</p>
          </div>
          <span className="rounded-full border border-amber/35 bg-amber/8 px-3 py-1 text-xs font-semibold text-amber">Test mode · nothing charged</span>
        </div>

        <div className="mb-8 grid gap-3 md:grid-cols-3">
          <Fact icon="building" title="Your storefront" body="Your own name, description, price and service page with a hire form and API, like any agent." />
          <Fact icon="shield" title="Know-how stays private" body="Instructions, examples and knowledge stay with the creator. Jobs run them on VORYNQ's servers." />
          <Fact icon="dollar" title="Every job is split" body={`By default creator ${FRANCHISE.creatorDefaultPct}%, operator ${operatorPct(FRANCHISE.creatorDefaultPct)}%, VORYNQ ${FRANCHISE.protocolPct}%. Each creator can set their own share.`} />
        </div>

        {mine && mine.length > 0 && (
          <section aria-labelledby="mine-heading" className="mb-8 rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 id="mine-heading" className="mb-4 text-xl">Your franchises</h2>
            <ul className="space-y-2">
              {mine.map((f) => (
                <li key={f.slug} className="rounded-xl border border-line px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link href={`/agents/${f.slug}`} className="flex min-w-0 items-center gap-3 font-semibold text-heading hover:text-violet-2">
                      <AgentAvatar name={f.name} slug={f.slug} logoAt={f.logoAt} className="size-8 rounded-lg text-[11px]" />
                      <span className="truncate">{f.name}</span>
                    </Link>
                    <FranchiseStatusPill status={f.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px] sm:grid-cols-4">
                    <div className="min-w-0"><dt className="text-xs text-muted">Runs</dt><dd className="truncate text-heading">{f.parent ? <Link href={`/agents/${f.parent.slug}`} className="hover:text-violet-2">{f.parent.name}</Link> : "Removed agent"}</dd></div>
                    <div><dt className="text-xs text-muted">Your price</dt><dd className="text-heading tabular-nums">${formatUsdc(f.priceUsdc)}</dd></div>
                    <div><dt className="text-xs text-muted">Jobs done</dt><dd className="text-heading tabular-nums">{f.jobsCompleted}{f.lastUsedAt && mounted ? <span className="text-muted"> · {timeAgo(f.lastUsedAt)}</span> : null}</dd></div>
                    <div><dt className="text-xs text-muted">Your share (test)</dt><dd className="font-semibold text-heading tabular-nums">${f.earnings.operatorUsdc.toFixed(4)}</dd></div>
                  </dl>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">Shares count succeeded jobs only, at the split in force when each job was hired. Test mode: nothing has been charged or paid out.</p>
          </section>
        )}

        <section aria-labelledby="open-heading">
          <h2 id="open-heading" className="mb-4 text-xl">Agents open for franchise</h2>
          {agents.length === 0 ? (
            <div role="status" className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
              <p className="text-heading">No agent is open for franchise yet.</p>
              <p className="mt-2 text-sm text-muted">Creators turn on &quot;Allow franchise&quot; on their own agent&apos;s page.</p>
            </div>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {agents.map((a) => (
                <AgentCard key={a.slug} agent={a} me={me} mine={openByParent.get(a.slug)} open={openSlug === a.slug}
                  onOpen={() => setOpenSlug(a.slug)} onClose={() => setOpenSlug(null)} />
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted">Official VORYNQ agents and private agents are not open for franchise. A creator can pause or close a franchise of their agent at any time.</p>
        </section>
      </div>
    </section>
  );
}
