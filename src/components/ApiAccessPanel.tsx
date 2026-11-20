"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AccessRequest, AgentPublic, ApiKeyInfo } from "@/shared/types";
import { ApiRequestError, api } from "../lib/api";
import { shortAddress } from "../shared/address";
import { Icon } from "./ui/Icon";
import { timeAgo } from "./ui/JobStatus";

const message = (err: unknown) => (err instanceof ApiRequestError ? Object.values(err.fields ?? {})[0] ?? err.message : "Something went wrong. Please try again.");

/** Owner-only: make the agent's API public or private, and create, see and revoke its API keys. */
export function ApiAccessPanel({ agent }: { agent: AgentPublic }) {
  const router = useRouter();
  const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null);
  const [requests, setRequests] = useState<AccessRequest[] | null>(null);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listKeys(agent.slug).then(setKeys, (err) => setError(message(err)));
    api.accessRequests(agent.slug).then(setRequests, (err) => setError(message(err)));
  }, [agent.slug]);

  const active = keys?.filter((k) => !k.revokedAt) ?? [];

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

  const setPrivate = (on: boolean) =>
    run("visibility", async () => {
      if (on && active.length === 0 && !window.confirm("This agent has no API keys yet, so no app will be able to call it until you create one. Make it private anyway?")) return;
      await api.updateAgent(agent.slug, { apiPrivate: on });
      router.refresh();
    });

  const create = (e: FormEvent) => {
    e.preventDefault();
    run("create", async () => {
      const r = await api.createKey(agent.slug, label);
      setFresh(r.key);
      setCopied(false);
      setLabel("");
      setKeys((ks) => [r.info, ...(ks ?? [])]);
    });
  };

  const revoke = (k: ApiKeyInfo) =>
    run(k.id, async () => {
      if (!window.confirm(`Revoke ${k.label || k.prefix}…? Apps using it stop working right away. This cannot be undone.`)) return;
      await api.revokeKey(agent.slug, k.id);
      setKeys((ks) => ks?.map((x) => (x.id === k.id ? { ...x, revokedAt: new Date().toISOString() } : x)) ?? null);
    });

  const setAutoApprove = (on: boolean) =>
    run("auto", async () => {
      await api.updateAgent(agent.slug, { autoApprove: on });
      // Turning it on approves everyone who was waiting.
      if (on) setRequests(await api.accessRequests(agent.slug));
      router.refresh();
    });

  const decide = (r: AccessRequest, action: "approve" | "reject" | "revoke") =>
    run(r.id, async () => {
      if (action === "revoke" && !window.confirm(`Remove access for ${shortAddress(r.requester)}? Their key stops working right away.`)) return;
      const updated = await api.decideAccess(agent.slug, r.id, action);
      setRequests((rs) => rs?.map((x) => (x.id === r.id ? updated : x)) ?? null);
      if (action === "revoke") setKeys(await api.listKeys(agent.slug));
    });

  async function copy() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const choice = (on: boolean) =>
    `flex-1 cursor-pointer rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-wait ${
      on ? "border-violet-2/70 bg-violet-2/12" : "border-line hover:border-line-strong"
    }`;

  return (
    <section aria-labelledby="access-heading" className="rounded-2xl border border-line bg-surface p-7">
      <h2 id="access-heading" className="mb-1 text-xl">API access</h2>
      <p className="mb-5 text-[13px] text-muted">Choose who can start jobs, and give apps their own keys. Only you see this.</p>

      <div role="radiogroup" aria-label="Who can start jobs" className="flex gap-3 max-sm:flex-col">
        <button type="button" role="radio" aria-checked={!agent.apiPrivate} disabled={busy !== null} onClick={() => agent.apiPrivate && setPrivate(false)} className={choice(!agent.apiPrivate)}>
          <span className="block text-sm font-semibold text-heading">Public</span>
          <span className="mt-0.5 block text-xs text-muted">Anyone can hire it from its page or the API.</span>
        </button>
        <button type="button" role="radio" aria-checked={agent.apiPrivate} disabled={busy !== null} onClick={() => !agent.apiPrivate && setPrivate(true)} className={choice(agent.apiPrivate)}>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-heading"><Icon name="shield" className="size-3.5" /> Private</span>
          <span className="mt-0.5 block text-xs text-muted">Only apps with an API key below (and you, signed in).</span>
        </button>
      </div>

      {agent.apiPrivate && (
        <div className="mt-6 border-t border-line pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-heading">Access requests</h3>
              <p className="mt-0.5 text-xs text-muted">Wallets ask on the agent page; once approved they make their own key.</p>
            </div>
            <label className="flex flex-none cursor-pointer items-center gap-2 text-sm text-heading">
              <input type="checkbox" checked={agent.autoApprove} disabled={busy !== null} onChange={(e) => setAutoApprove(e.target.checked)}
                className="size-4 cursor-pointer accent-violet-2 disabled:cursor-wait" />
              Auto-approve
            </label>
          </div>
          <ul className="mt-3 space-y-2">
            {requests === null && !error && <li className="text-sm text-muted">Loading requests…</li>}
            {requests?.length === 0 && <li className="text-sm text-muted">No requests yet.</li>}
            {requests?.map((r) => (
              <li key={r.id} className={`rounded-xl border px-4 py-3 ${r.status === "pending" ? "border-amber/40 bg-amber/5" : "border-line"} ${r.status === "rejected" || r.status === "revoked" ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-mono text-sm text-heading" title={r.requester}>{shortAddress(r.requester)}</span>
                  <span className="text-xs text-muted">
                    {r.status === "pending" ? `Asked ${timeAgo(r.createdAt)}` : `${{ approved: "Approved", rejected: "Declined", revoked: "Removed" }[r.status]} ${r.decidedAt ? timeAgo(r.decidedAt) : ""}`}
                  </span>
                  <span className="ml-auto flex gap-3 text-sm">
                    {(r.status === "pending" || r.status === "rejected") && (
                      <button type="button" disabled={busy !== null} onClick={() => decide(r, "approve")} className="cursor-pointer font-medium text-mint hover:underline disabled:cursor-wait">Approve</button>
                    )}
                    {r.status === "pending" && (
                      <button type="button" disabled={busy !== null} onClick={() => decide(r, "reject")} className="cursor-pointer text-muted hover:text-heading hover:underline disabled:cursor-wait">Decline</button>
                    )}
                    {r.status === "approved" && (
                      <button type="button" disabled={busy !== null} onClick={() => decide(r, "revoke")} className="cursor-pointer text-magenta hover:underline disabled:cursor-wait">Remove access</button>
                    )}
                  </span>
                </div>
                {r.message && <p className="mt-1.5 text-sm text-body">“{r.message}”</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fresh && (
        <div role="status" className="mt-5 rounded-xl border border-mint/40 bg-mint/8 p-4">
          <p className="text-sm font-semibold text-heading">Your new API key</p>
          <p className="mt-0.5 text-xs text-body">Copy it now and keep it secret. For your safety it is not stored and will not be shown again.</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-ink-2 px-3 py-2 font-mono text-[12.5px] text-heading">{fresh}</code>
            <button type="button" onClick={copy} className="btn btn-ghost btn-sm flex-none"><Icon name="copy" className="size-4" /> {copied ? "Copied" : "Copy"}</button>
          </div>
          <button type="button" onClick={() => setFresh(null)} className="mt-3 cursor-pointer text-xs text-muted hover:text-heading">I have saved it</button>
        </div>
      )}

      <form onSubmit={create} className="mt-5 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Key name</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Key name, e.g. My trading bot"
            className="h-10 w-full rounded-xl border border-line bg-ink/60 px-3 text-sm text-heading placeholder:text-muted focus:border-violet-2 focus:outline-none" />
        </label>
        <button type="submit" disabled={busy !== null} className="btn btn-primary btn-sm flex-none disabled:cursor-wait disabled:opacity-60">
          <Icon name="plus" className="size-4" /> {busy === "create" ? "Creating…" : "Create key"}
        </button>
      </form>

      {error && <p role="alert" className="mt-3 text-sm text-[#ff7e80]">{error}</p>}

      <ul className="mt-4 space-y-2">
        {keys === null && !error && <li className="text-sm text-muted">Loading keys…</li>}
        {keys?.length === 0 && <li className="text-sm text-muted">No keys yet.</li>}
        {keys?.map((k) => (
          <li key={k.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line px-4 py-3 ${k.revokedAt ? "opacity-60" : ""}`}>
            <span className="min-w-0 flex-[1_1_200px]">
              <span className="block truncate text-sm text-heading">{k.holder ? <>Made by <span className="font-mono">{shortAddress(k.holder)}</span></> : k.label || "Unnamed key"}</span>
              <span className="font-mono text-xs text-muted">{k.prefix}…</span>
            </span>
            <span className="text-xs text-muted">
              {k.revokedAt ? `Revoked ${timeAgo(k.revokedAt)}` : k.lastUsedAt ? `Used ${timeAgo(k.lastUsedAt)}` : "Never used"} · {k.jobs} {k.jobs === 1 ? "job" : "jobs"}
            </span>
            {!k.revokedAt && (
              <button type="button" disabled={busy !== null} onClick={() => revoke(k)} className="ml-auto cursor-pointer text-sm text-magenta hover:underline disabled:cursor-wait">
                {busy === k.id ? "Revoking…" : "Revoke"}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">Send a key as <code className="font-mono">Authorization: Bearer vrq_…</code>. Up to 10 active keys per agent.</p>
    </section>
  );
}
