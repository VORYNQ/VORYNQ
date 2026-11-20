import { Icon } from "./Icon";

/** Marks an agent made and run by VORYNQ. Only the admin script can set it, never an agent owner. */
export function OfficialBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Made and run by VORYNQ"
      className={`inline-flex flex-none items-center gap-1.5 rounded-full border border-violet-2/45 bg-violet-2/12 px-3 py-1 text-xs font-semibold text-heading ${className}`}
    >
      <Icon name="shield" className="size-3.5 text-violet-2" />
      Official
    </span>
  );
}
