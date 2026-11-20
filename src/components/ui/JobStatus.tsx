import type { Job } from "@/shared/types";

const STATUS: Record<Job["status"], [string, string]> = {
  queued: ["Queued", "text-amber border-amber/35 bg-amber/8"],
  running: ["Working…", "text-violet-2 border-violet-2/40 bg-violet-2/10"],
  succeeded: ["Completed", "text-mint border-mint/35 bg-mint/8"],
  failed: ["Failed", "text-[#ff7e80] border-[#ff7e80]/40 bg-[#ff7e80]/10"],
};

export function StatusPill({ status }: { status: Job["status"] }) {
  const [text, cls] = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}>
      {(status === "queued" || status === "running") && <span className="size-2 animate-pulse rounded-full bg-current" />}
      {text}
    </span>
  );
}

export const timeAgo = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
};
