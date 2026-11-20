"use client";

import { useEffect, useRef, useState } from "react";
import { IMAGE_ALT, MODULES } from "../data/content";
import { Banner } from "./ui/Banner";
import { Button } from "./ui/Button";
import { StatusBadge } from "./ui/Section";

// Launcher already appears in the About section, so the tour starts at Franchise.
const SLIDES = MODULES.filter((m) => m.id !== "launcher");
const INTERVAL = 6000;

/** Tabbed tour of the platform modules; auto-advances until the visitor hovers or picks a tab. */
export function Showcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % SLIDES.length), INTERVAL);
    return () => clearInterval(t);
  }, [paused]);

  // On mobile the tabs are a horizontal strip: keep the active one in view.
  useEffect(() => {
    const list = listRef.current;
    const tab = list?.children[active] as HTMLElement | undefined;
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    // The list is position:relative, so offsetLeft is measured from its edge.
    list.scrollTo({ left: tab.offsetLeft - 16, behavior: "smooth" });
  }, [active]);

  const current = SLIDES[active];

  return (
    <div className="grid items-center gap-12 max-lg:gap-8 lg:grid-cols-[380px_1fr]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div ref={listRef} role="tablist" aria-label="Platform modules" className="relative flex flex-col gap-2 [scrollbar-width:none] max-lg:order-last max-lg:flex-row max-lg:overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {SLIDES.map((m, i) => {
          const on = i === active;
          return (
            <button
              key={m.id}
              role="tab"
              aria-selected={on}
              aria-controls="showcase-panel"
              onClick={() => { setActive(i); setPaused(true); }}
              className={`relative flex-none cursor-pointer overflow-hidden rounded-2xl border px-5 py-4 text-left transition-colors ${on ? "border-violet-2/50 bg-surface-2" : "border-line hover:bg-surface"}`}
            >
              <span className={`block text-[17px] font-semibold ${on ? "text-heading" : "text-body"}`}>{m.name}</span>
              <span className="mt-1 block text-sm text-muted max-lg:hidden">{m.title}</span>
              {/* Progress bar for the auto-advance timer. */}
              {on && !paused && (
                <span key={active} className="bg-grad absolute inset-x-0 bottom-0 h-0.5 origin-left animate-[grow_6s_linear_forwards]" />
              )}
            </button>
          );
        })}
      </div>

      <div id="showcase-panel" role="tabpanel">
        <div className="relative">
          {SLIDES.map((m, i) => (
            <div key={m.id} className={`transition-opacity duration-700 ${i === active ? "relative opacity-100" : "pointer-events-none absolute inset-0 opacity-0"}`}>
              <Banner name={m.id} alt={IMAGE_ALT[m.id]} sizes="(min-width: 1024px) 760px, 100vw" />
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <StatusBadge status={current.status} label={current.statusLabel} className="flex-none" />
            <p className="text-[15px]">{current.body.split(". ")[0]}.</p>
          </div>
          <Button to={`/platform#${current.id}`} variant="ghost" size="sm" arrow>Learn more</Button>
        </div>
      </div>
    </div>
  );
}
