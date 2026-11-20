import { AGENT_CATEGORIES, type AgentCategoryId } from "@/shared/catalog";
import { CATEGORY_ICONS } from "./ui/CategoryBadge";
import { Icon } from "./ui/Icon";

type Props = {
  value: AgentCategoryId | null;
  onChange: (id: AgentCategoryId) => void;
  name?: string;
  disabled?: boolean;
};

/**
 * Compact single-choice picker for an agent's primary category: four small icon tiles in a row.
 * Place it inside a <fieldset> with a <legend>. Built on native radio inputs, so Tab moves into
 * the group and arrow keys move the selection.
 */
export function CategoryPicker({ value, onChange, name = "category", disabled }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {AGENT_CATEGORIES.map((c) => {
        const on = value === c.id;
        return (
          <label
            key={c.id}
            className={`flex h-12 items-center gap-2.5 rounded-xl border px-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-violet-2 ${
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            } ${on ? "border-violet-2/70 bg-violet-2/10 shadow-[0_0_0_1px_rgb(151_71_255/0.35)]" : `border-line ${disabled ? "" : "hover:border-line-strong hover:bg-surface"}`}`}
          >
            <input type="radio" name={name} value={c.id} checked={on} disabled={disabled} onChange={() => onChange(c.id)} className="sr-only" />
            <Icon name={CATEGORY_ICONS[c.id]} className={`size-[18px] flex-none ${on ? "text-violet-2" : "text-body"}`} />
            <span className="truncate text-[14px] font-semibold text-heading">{c.label}</span>
          </label>
        );
      })}
    </div>
  );
}
