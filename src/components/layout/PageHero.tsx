import type { ReactNode } from "react";
import Link from "next/link";
import { NetworkCanvas } from "../visual/NetworkCanvas";
import { Eyebrow } from "../ui/Section";
import { Reveal } from "../ui/Reveal";

type Props = {
  tag: string;
  eyebrow: string;
  title: ReactNode;
  lead: string;
  actions?: ReactNode;
  /** Parent pages, shown as a breadcrumb above the eyebrow (current page excluded). */
  crumbs?: { to: string; label: string }[];
  /** Shorter hero with a smaller title, so the content below fits in the first screen. */
  compact?: boolean;
};

/** Centred hero used by every inner page. */
export function PageHero({ tag, eyebrow, title, lead, actions, crumbs, compact }: Props) {
  return (
    <section className={`relative overflow-hidden ${compact ? "pt-[96px] pb-6 max-sm:pt-[100px] short:pt-[84px] short:pb-4" : "pt-[190px] pb-[90px] max-sm:pt-[150px] max-sm:pb-[60px]"}`}>
      <NetworkCanvas />
      <HeroGlow />
      <div className="container-x relative z-[2]">
        <div className="mx-auto max-w-[860px] text-center">
          {crumbs && (
            <nav aria-label="Breadcrumb" className="mb-6 flex justify-center gap-2 font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
              {crumbs.map((c) => (
                <span key={c.to} className="flex gap-2">
                  <Link href={c.to} className="transition-colors hover:text-heading">{c.label}</Link>
                  <span aria-hidden="true">/</span>
                </span>
              ))}
              <span aria-current="page" className="text-heading">{eyebrow}</span>
            </nav>
          )}
          <Reveal><Eyebrow tag={tag}>{eyebrow}</Eyebrow></Reveal>
          <Reveal delay={1}>
            <h1 className={compact ? "mt-5 mb-4 text-[clamp(34px,3.6vw,52px)] short:mt-3 short:mb-2 short:text-[36px]" : "h1 mt-7 mb-[26px]"}>{title}</h1>
          </Reveal>
          <Reveal delay={2}>
            <p className={`mx-auto ${compact ? "max-w-[760px] text-[17px] short:text-[15px]" : "max-w-[640px] text-xl max-sm:text-lg"}`}>{lead}</p>
          </Reveal>
          {actions && (
            <Reveal delay={3}>
              <div className="mt-10 flex flex-wrap justify-center gap-3.5 max-sm:[&>*]:flex-[1_1_100%]">{actions}</div>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}

/** Violet corner glow plus a fade into the page background. */
export function HeroGlow() {
  return (
    <>
      <div className="pointer-events-none absolute -top-[200px] -right-[250px] z-0 size-[900px] rounded-full bg-[radial-gradient(circle,rgb(112_40_228/0.35)_0%,rgb(112_40_228/0)_65%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-60 bg-gradient-to-b from-ink/0 to-ink" />
    </>
  );
}
