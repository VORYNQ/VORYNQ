"use client";

import { useEffect, useState } from "react";
import { ApiRequestError, api, ownerTokens } from "../lib/api";
import { Icon } from "./ui/Icon";

/** Agents created in this browser before wallet sign-in, which the signed-in wallet can take over. */
export function ClaimBanner({ address, onClaimed }: { address: string; onClaimed: () => void }) {
  const [claimable, setClaimable] = useState<{ slug: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = ownerTokens.all();
    if (!saved.length) return setClaimable([]);
    let live = true;
    api.claim(saved, true).then(
      (r) => {
        if (!live) return;
        r.stale.forEach((slug) => ownerTokens.remove(slug)); // Gone or already owned: nothing left to claim.
        setClaimable(r.claimable ?? []);
      },
      () => {}
    );
    return () => {
      live = false;
    };
  }, [address]);

  if (!claimable.length) return null;

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const slugs = new Set(claimable.map((c) => c.slug));
      const r = await api.claim(ownerTokens.all().filter((c) => slugs.has(c.slug)), false);
      [...(r.claimed ?? []).map((c) => c.slug), ...r.stale].forEach((slug) => ownerTokens.remove(slug));
      setClaimable([]);
      onClaimed();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not claim the agents. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="status" className="flex flex-wrap items-center gap-4 rounded-2xl border border-violet-2/40 bg-violet-2/10 p-4 sm:p-5">
      <span className="grid size-11 flex-none place-items-center rounded-xl bg-violet-2/15 text-violet-2"><Icon name="wallet" className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-heading">
          {claimable.length === 1 ? "1 agent" : `${claimable.length} agents`} created in this browser {claimable.length === 1 ? "isn't" : "aren't"} linked to a wallet yet
        </p>
        <p className="mt-0.5 text-sm text-body">
          {claimable.map((c) => c.name).join(", ")}. {claimable.length === 1 ? "Claim it to manage it" : "Claim them to manage them"} from any browser with this wallet.
        </p>
        {error && <p role="alert" className="mt-1 text-sm text-magenta">{error}</p>}
      </div>
      <button type="button" onClick={claim} disabled={busy} className="btn btn-primary btn-sm flex-none disabled:cursor-wait disabled:opacity-60">
        {busy ? "Claiming…" : claimable.length === 1 ? "Claim this agent to my wallet" : "Claim these agents to my wallet"}
      </button>
    </div>
  );
}
