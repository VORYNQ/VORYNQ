"use client";

import { useEffect, useState } from "react";
import { THEME_COLOR, THEME_KEY, type Theme } from "@/lib/theme";
import { Icon } from "../ui/Icon";

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

/** Sun/moon button that switches between the light pastel and the dark theme, remembered per browser. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  // Null until mounted: the server can't know the saved choice, so render a neutral icon first.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"), []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    apply(next);
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label}
      className={`inline-flex size-10 cursor-pointer items-center justify-center rounded-md border border-line-strong text-heading transition-colors hover:bg-surface-2 ${className}`}>
      <Icon name={theme === "dark" ? "sun" : "moon"} className={`size-[18px] transition-opacity ${theme ? "opacity-100" : "opacity-0"}`} />
    </button>
  );
}
