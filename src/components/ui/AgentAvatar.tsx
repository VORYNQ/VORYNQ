"use client";

import { useState } from "react";
import { initials } from "@/lib/api";

/** FNV-1a: a small, stable hash so the same name always draws the same placeholder. */
function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * An agent's logo. With a slug it shows the AI-generated image (Cloudflare Workers AI, made on first request);
 * until that loads, or if there is none, a placeholder drawn from the name: gradient, pattern and initials.
 * Size, corner radius and text size come from `className`.
 */
export function AgentAvatar({ name, slug, logoAt, className = "" }: { name: string; slug?: string; logoAt?: string | null; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const src = slug && `/api/agents/${encodeURIComponent(slug)}/logo${logoAt ? `?v=${encodeURIComponent(logoAt)}` : ""}`;

  const h = hash(name.trim().toLowerCase() || "agent");
  const hue = h % 360;
  const hue2 = (hue + 35 + ((h >>> 9) % 70)) % 360;
  const angle = (h >>> 16) % 360;
  const pattern = (h >>> 24) % 3;
  const x = 20 + ((h >>> 4) % 60);
  const y = 20 + ((h >>> 12) % 60);

  return (
    <div aria-hidden="true" className={`relative grid flex-none place-items-center overflow-hidden font-bold text-white ${className}`}
      style={{ backgroundImage: `linear-gradient(${angle}deg, hsl(${hue} 76% 48%), hsl(${hue2} 80% 42%))` }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" fill="none" stroke="white">
        {pattern === 0 && (
          <>
            <circle cx={x} cy={y} r="24" strokeOpacity="0.3" strokeWidth="6" />
            <circle cx={x} cy={y} r="44" strokeOpacity="0.16" strokeWidth="6" />
          </>
        )}
        {pattern === 1 && (
          <>
            <circle cx={x} cy={y} r="34" fill="white" fillOpacity="0.18" stroke="none" />
            <circle cx={100 - x} cy={100 - y} r="20" fill="white" fillOpacity="0.12" stroke="none" />
          </>
        )}
        {pattern === 2 && <path d="M-20 40 40-20M-20 80 80-20M0 120 120 0M40 120 120 40" strokeOpacity="0.18" strokeWidth="9" />}
      </svg>
      <span className="relative drop-shadow-[0_1px_2px_rgb(0_0_0/0.3)]">{initials(name)}</span>
      {src && broken !== src && (
        // eslint-disable-next-line @next/next/no-img-element -- small API-served image, already sized and cached by the route
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(src)} className="absolute inset-0 size-full object-cover" />
      )}
    </div>
  );
}
