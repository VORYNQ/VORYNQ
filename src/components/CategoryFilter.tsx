import { AGENT_CATEGORIES, type AgentCategoryId } from "@/shared/catalog";
import { CATEGORY_ICONS } from "./ui/CategoryBadge";
import { Icon } from "./ui/Icon";

export type CategoryFilterValue = AgentCategoryId | "all";

const FILTERS: { id: CategoryFilterValue; label: string }[] = [{ id: "all", label: "All Categories" }, ...AGENT_CATEGORIES];

type Props = {
  value: CategoryFilterValue;
  onChange: (f: CategoryFilterValue) => void;
  /** Optional agent count per filter, shown next to each label. */
  counts?: Record<CategoryFilterValue, number>;
  className?: string;
};

/** "All Categories" plus one toggle per primary category. Scrolls sideways on narrow screens. */
export function CategoryFilter({ value, onChange, counts, className = "mb-8" }: Props) {
  return (
    <div role="group" aria-label="Filter agents by category" className={`flex gap-2 overflow-x-auto p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
      {FILTERS.map((f) => {
        const on = value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(f.id)}
            className={`inline-flex h-10 flex-none cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2 ${
              on ? "border-violet-2/70 bg-violet-2/15 text-heading" : "border-line text-body hover:border-line-strong hover:text-heading"
            }`}
          >
            {f.id !== "all" && <Icon name={CATEGORY_ICONS[f.id]} className="size-4" />}
            {f.label}
            {counts && <span className={`tabular-nums ${on ? "text-heading/70" : "text-muted"}`}>{counts[f.id]}</span>}
          </button>
        );
      })}
    </div>
  );
}
