"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "./Icon";

type Props = {
  children: ReactNode;
  to?: string;
  className?: string;
};

// Feed the cursor position to the CSS glow in .glass-card::before.
function trackGlow(e: MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

export function Card({ children, to, className = "" }: Props) {
  const cls = `glass-card block h-full ${className}`;
  return to ? (
    <Link href={to} className={cls} onMouseMove={trackGlow}>{children}</Link>
  ) : (
    <article className={cls} onMouseMove={trackGlow}>{children}</article>
  );
}

export function IconBox({ name }: { name: IconName }) {
  return (
    <div className="icon-box">
      <Icon name={name} />
    </div>
  );
}

/** Icon + title + body: the most common card layout. */
export function FeatureCard({ icon, title, body, to }: { icon: IconName; title: string; body: string; to?: string }) {
  return (
    <Card to={to}>
      <IconBox name={icon} />
      <h4 className="mb-3 text-[19px]">{title}</h4>
      <p className="text-base">{body}</p>
    </Card>
  );
}
