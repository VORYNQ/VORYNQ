"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AgentPublic, MyAccess } from "@/shared/types";
import { ApiRequestError, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ConnectWallet } from "./layout/ConnectWallet";
import { PrivacyNote } from "./PrivacyNote";
import { Icon } from "./ui/Icon";
import { timeAgo } from "./ui/JobStatus";

const message = (err: unknown) => (err instanceof ApiRequestError ? Object.values(err.fields ?? {})[0] ?? err.message : "Something went wrong. Please try again.");

/** For visitors of a private agent: ask its owner for access, then make your own API key once approved. */
export function AccessRequestPanel({ agent }: { agent: AgentPublic }) {
  const auth = useAuth();
  // undefined while loading; null when this wallet has not asked yet.
  const [access, setAccess] = useState<MyAccess | null | undefined>(undefined);
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"request" | "key" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAccess(undefined);
    setFresh(null);
    if (!auth.address) return;
    api.myAccess(agent.slug).then(setAccess, (err) => setError(message(err)));
  }, [agent.slug, auth.address]);

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<void>) {
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

  const ask = (e: FormEvent) => {
    e.preventDefault();
    run("request", async () => setAccess(await api.requestAccess(agent.slug, note)));
  };

  const makeKey = () =>
    run("key", async () => {
      if (access?.key && !window.confirm("Make a new key? Your current key stops working right away.")) return;
      const r = await api.createAccessKey(agent.slug);
      setFresh(r.key);
      setCopied(false);
      setAccess((a) => a && { ...a, key: r.info });
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

  const askForm = (again: boolean) => (
    <form onSubmit={ask} className="mt-4 space-y-3">
      <label className="block text-sm font-medium text-heading">What will you use it for? <span className="font-normal text-muted">(optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3}
          placeholder="e.g. Daily wallet reports for my trading desk"
          className="mt-2 w-full resize-none rounded-xl border border-line-strong bg-ink/60 px-4 py-3 text-sm text-heading placeholder:text-muted focus:border-violet-2 focus:outline-none" />
      </label>
      <button type="submit" disabled={busy !== null} className="btn btn-primary btn-sm disabled:cursor-wait disabled:opacity-60">
        {busy === "request" ? "Sending…" : again ? "Ask again" : agent.autoApprove ? "Get access" : "Request access"}
      </button>
    </form>
  );

  return (
    <section aria-labelledby="access-request-heading" className="rounded-2xl border border-line bg-surface p-7">
      <h2 id="access-request-heading" className="mb-2 flex items-center gap-2 text-xl"><Icon name="shield" className="size-5 text-amber" /> Private agent</h2>
      <p className="text-sm">
        This agent only takes jobs from apps with one of its API keys.{" "}
        {agent.autoApprove ? "Access is granted instantly: sign in and get your own key." : "Ask its owner for access; once approved you make your own key here."}
      </p>

      {!auth.address ? (
        <div className="mt-4"><ConnectWallet label="Connect wallet to ask for access" /></div>
      ) : access === undefined ? (
        !error && <p className="mt-4 text-sm text-muted">Checking your access…</p>
      ) : access === null ? (
        askForm(false)
      ) : access.status === "pending" ? (
        <p role="status" className="mt-4 rounded-xl border border-amber/40 bg-amber/8 px-4 py-3 text-sm text-heading">
          Request sent {timeAgo(access.createdAt)}. Waiting for the owner to approve it; check back here.
        </p>
      ) : access.status === "rejected" ? (
        <>
          <p className="mt-4 text-sm text-muted">The owner declined your request {access.decidedAt ? timeAgo(access.decidedAt) : ""}. You can ask again with more detail.</p>
          {askForm(true)}
        </>
      ) : access.status === "revoked" ? (
        <p className="mt-4 text-sm text-muted">The owner removed your access to this agent.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <p role="status" className="rounded-xl border border-mint/40 bg-mint/8 px-4 py-3 text-sm text-heading">
            <Icon name="check" className="mr-1 inline size-4 text-mint" /> You have access.
            {access.key
              ? <> Your key <code className="font-mono">{access.key.prefix}…</code> {access.key.lastUsedAt ? `was used ${timeAgo(access.key.lastUsedAt)}` : "has not been used yet"} · {access.key.jobs} {access.key.jobs === 1 ? "job" : "jobs"}.</>
              : " Make your API key to call it from code."}
          </p>
          {fresh && (
            <div role="status" className="rounded-xl border border-mint/40 bg-mint/8 p-4">
              <p className="text-sm font-semibold text-heading">Your API key</p>
              <p className="mt-0.5 text-xs text-body">Copy it now and keep it secret. It is not stored and will not be shown again.</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-ink-2 px-3 py-2 font-mono text-[12.5px] text-heading">{fresh}</code>
                <button type="button" onClick={copy} className="btn btn-ghost btn-sm flex-none"><Icon name="copy" className="size-4" /> {copied ? "Copied" : "Copy"}</button>
              </div>
            </div>
          )}
          <button type="button" onClick={makeKey} disabled={busy !== null} className={`btn btn-sm disabled:cursor-wait disabled:opacity-60 ${access.key ? "btn-ghost" : "btn-primary"}`}>
            {busy === "key" ? "Making key…" : access.key ? "Replace my key" : "Create my API key"}
          </button>
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-[#ff7e80]">{error}</p>}
      <PrivacyNote agent={agent} className="mt-5" />
    </section>
  );
}
