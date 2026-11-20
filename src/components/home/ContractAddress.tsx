"use client";

import { useState } from "react";
import { TOKEN_CA } from "../../data/content";
import { Icon } from "../ui/Icon";

/** "$VYNQ CA" row with a copy button. Until TOKEN_CA is filled in it shows a placeholder and no button, so the text fits on phones. */
export function ContractAddress() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(TOKEN_CA);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <div className="mt-6 flex min-h-[54px] max-w-[520px] items-center gap-3 rounded-2xl border border-line bg-frost py-2 pr-2 pl-4">
      <span className="flex-none text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">$VYNQ CA</span>
      <span className={`min-w-0 flex-1 truncate font-mono text-[14px] ${TOKEN_CA ? "text-heading" : "text-muted"}`} title={TOKEN_CA || undefined}>
        {TOKEN_CA || "Coming soon"}
      </span>
      {TOKEN_CA && (
        <button type="button" onClick={copy} aria-label="Copy contract address"
          className="flex h-9 flex-none cursor-pointer items-center gap-1.5 rounded-xl bg-heading/6 px-3 text-[13px] font-semibold text-heading transition hover:bg-heading/10">
          <Icon name={copied ? "check" : "copy"} className={`size-4 ${copied ? "text-live" : ""}`} />
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}
