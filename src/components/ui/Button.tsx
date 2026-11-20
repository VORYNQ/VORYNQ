import type { ReactNode } from "react";
import Link from "next/link";

type Props = {
  to: string;
  children: ReactNode;
  variant?: "primary" | "ghost" | "light";
  size?: "md" | "sm";
  arrow?: boolean;
  className?: string;
};

/** Pill button. Internal paths use the router; "#" and external URLs render a plain anchor. */
export function Button({ to, children, variant = "primary", size = "md", arrow, className = "" }: Props) {
  const cls = `btn group btn-${variant}${size === "sm" ? " btn-sm" : ""} ${className}`;
  const content = (
    <>
      {children}
      {arrow && <span className="transition-transform duration-300 group-hover:translate-x-[3px]">→</span>}
    </>
  );
  return to.startsWith("/") ? (
    <Link href={to} className={cls}>{content}</Link>
  ) : (
    <a href={to} className={cls}>{content}</a>
  );
}
