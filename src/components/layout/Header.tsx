"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "../../data/content";
import { ConnectWallet } from "./ConnectWallet";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

// Flat text links sitting right next to the logo; the active one gets a gradient underline.
const linkCls = (isActive: boolean) =>
  `relative py-2 text-[15px] font-medium tracking-[0.01em] transition-colors hover:text-heading after:absolute after:inset-x-0 after:-bottom-[15px] after:h-0.5 after:rounded-full after:bg-grad after:transition-opacity ${
    isActive ? "text-heading after:opacity-100" : "text-body after:opacity-0"
  }`;

// A section stays active on its sub-pages, e.g. Agents on /agents/launcher.
const isActive = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

function NavItem({ to, label, className }: { to: string; label: string; className?: string }) {
  const pathname = usePathname();
  if (!to.startsWith("/")) return <a href={to} className={className ?? linkCls(false)}>{label}</a>;
  const active = isActive(pathname, to);
  return <Link href={to} aria-current={active ? "page" : undefined} className={className ?? linkCls(active)}>{label}</Link>;
}

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-50 border-b border-line backdrop-blur-xl transition-colors duration-300 ${scrolled ? "bg-ink/85" : "bg-ink/55"}`}>
        <div className="mx-auto flex h-[68px] w-full max-w-[1800px] items-center gap-10 px-6 max-sm:px-4 lg:px-12">
          <Logo />

          <nav aria-label="Main" className="hidden items-center gap-8 lg:flex">
            {NAV.map((n) => <NavItem key={n.label} {...n} />)}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <ConnectWallet className="hidden lg:block" />
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="inline-flex size-10 cursor-pointer items-center justify-center rounded-md border border-line-strong text-heading lg:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={open ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"} /></svg>
            </button>
          </div>
        </div>
      </header>

      <div className={`fixed inset-x-4 top-[80px] z-49 rounded-xl border border-line-strong bg-ink/95 shadow-[0_20px_50px_-20px_rgb(60_40_120/0.35)] p-3.5 backdrop-blur-xl transition duration-250 lg:hidden ${open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2.5 opacity-0"}`}>
        {NAV.map((n) => (
          <NavItem key={n.label} {...n} className="block rounded-lg px-4 py-3.5 text-[17px] text-heading hover:bg-surface-2" />
        ))}
        <ConnectWallet className="mt-2" full />
      </div>
    </>
  );
}
