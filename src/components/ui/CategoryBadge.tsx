import { categoryInfo, type AgentCategoryId } from "@/shared/catalog";
import { Icon, type IconName } from "./Icon";

/** One icon per primary category, used everywhere a category is shown. */
export const CATEGORY_ICONS: Record<AgentCategoryId, IconName> = {
  research: "search",
  trading: "trending",
  automation: "workflow",
  analytics: "columns",
};

/** One accent per category: `tile` for solid icon tiles, `badge` for pills, `text` for icons on dark. */
export const CATEGORY_TONES: Record<AgentCategoryId, { tile: string; badge: string; text: string }> = {
  research: { tile: "bg-[linear-gradient(135deg,#4763ff,#9747ff)]", badge: "border-blue/40 bg-blue/10", text: "text-blue" },
  trading: { tile: "bg-[linear-gradient(135deg,#1fa877,#3ddc97)]", badge: "border-mint/35 bg-mint/8", text: "text-mint" },
  automation: { tile: "bg-[linear-gradient(135deg,#e8892b,#ffb547)]", badge: "border-amber/35 bg-amber/8", text: "text-amber" },
  analytics: { tile: "bg-[linear-gradient(135deg,#b23cff,#ff4f8b)]", badge: "border-violet-2/40 bg-violet-2/10", text: "text-violet-2" },
};

/** Pill with the category icon and label. Renders "Uncategorized" for agents created before categories existed. */
export function CategoryBadge({ category, className = "" }: { category: AgentCategoryId | null; className?: string }) {
  if (!category) {
    return <span className={`inline-flex items-center rounded-full border border-line px-3 py-1 text-xs text-muted ${className}`}>Uncategorized</span>;
  }
  const tone = CATEGORY_TONES[category];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold text-heading ${tone.badge} ${className}`}>
      <Icon name={CATEGORY_ICONS[category]} className={`size-3.5 ${tone.text}`} />
      {categoryInfo(category).label}
    </span>
  );
}

/** Small rounded tag chip for capability tags. */
export function TagChip({ children }: { children: string }) {
  return <span className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-body">{children}</span>;
}
