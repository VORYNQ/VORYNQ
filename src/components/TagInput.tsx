"use client";

import { useState, type KeyboardEvent } from "react";
import { LIMITS, normalizeTags } from "@/shared/catalog";

type Props = {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  describedBy?: string;
};

/** Free-form capability tags: Enter or comma adds a tag, Backspace on an empty field removes the last one. */
export function TagInput({ id, value, onChange, placeholder, describedBy }: Props) {
  const [draft, setDraft] = useState("");
  const full = value.length >= LIMITS.tagsMax;

  const add = (parts: string[]) => {
    const next = parts.map((p) => p.slice(0, LIMITS.tagMax)).filter((p) => p.trim());
    if (next.length) onChange(normalizeTags([...value, ...next]).slice(0, LIMITS.tagsMax));
  };

  const commit = () => {
    add([draft]);
    setDraft("");
  };

  // Commas typed or pasted (mobile keyboards often skip keydown) split the text into tags.
  const onInput = (text: string) => {
    if (!text.includes(",")) return setDraft(text);
    const parts = text.split(",");
    add(parts.slice(0, -1));
    setDraft(parts[parts.length - 1]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-ink/60 px-3 py-2 focus-within:border-violet-2">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 py-0.5 pr-1 pl-2 text-[13px] text-heading">
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}
            className="grid size-5 cursor-pointer place-items-center rounded text-muted hover:bg-surface-2 hover:text-heading focus-visible:outline-2 focus-visible:outline-violet-2">
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        disabled={full}
        onChange={(e) => onInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        aria-describedby={describedBy}
        placeholder={full ? `Up to ${LIMITS.tagsMax} tags` : value.length ? "" : placeholder}
        className="h-8 min-w-[140px] flex-1 bg-transparent text-heading placeholder:text-muted focus:outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
}
