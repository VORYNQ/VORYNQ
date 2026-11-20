import type { ReactNode } from "react";
import type { Status } from "../../data/content";
import { Button } from "./Button";
import { Card } from "./Card";
import { Reveal } from "./Reveal";

export function SectionHead({ kicker, title, children, className = "mb-16" }: { kicker: string; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <Reveal className={`mx-auto max-w-[760px] text-center ${className}`}>
      <span className="kicker">{kicker}</span>
      <h2 className="h2">{title}</h2>
      {children && <p className="mt-5 text-lg">{children}</p>}
    </Reveal>
  );
}

const STATUS_STYLE: Record<Status, [string, string]> = {
  live: ["Live", "text-mint border-mint/35 bg-mint/8"],
  beta: ["Beta", "text-violet-2 border-violet-2/40 bg-violet-2/10"],
  soon: ["Coming soon", "text-amber border-amber/35 bg-amber/8"],
  research: ["Research", "text-blue border-blue/40 bg-blue/10"],
  progress: ["In progress", "text-amber border-amber/35 bg-amber/8"],
  planned: ["Planned", "text-muted border-line-strong bg-surface"],
};

/** `label` replaces the default text, e.g. "Coming Q1 2027" for a "soon" module. */
export function StatusBadge({ status, label: text, className = "" }: { status: Status; label?: string; className?: string }) {
  const [fallback, cls] = STATUS_STYLE[status];
  const label = text ?? fallback;
  return (
    <span className={`inline-flex items-center gap-[7px] rounded-full border px-3 py-[5px] text-[13px] font-semibold tracking-[0.02em] ${cls} ${className}`}>
      <span className="size-[7px] rounded-full bg-current" />
      {label}
    </span>
  );
}

export function Eyebrow({ tag, children }: { tag: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2.5 rounded-full border border-line bg-surface py-1.5 pr-3.5 pl-1.5 text-sm text-body backdrop-blur-sm">
      <span className="bg-grad rounded-full px-2.5 py-[3px] text-xs font-semibold tracking-[0.04em] text-white">{tag}</span>
      {children}
    </span>
  );
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return (
    <Reveal>
      <p className="mt-10 rounded-xl border border-line bg-surface px-[26px] py-[22px] text-[13.5px] leading-[1.65] text-muted">
        <strong className="text-body">Disclaimer.</strong> {children}
      </p>
    </Reveal>
  );
}

/** Three numbered step cards ("01 / Build"). */
export function StepCards({ steps }: { steps: { label: string; title: string; body: string }[] }) {
  return (
    <div className="grid gap-[22px] md:grid-cols-3">
      {steps.map((s, i) => (
        <Reveal key={s.label} delay={i as 0 | 1 | 2}>
          <Card>
            <span className="mb-10 block text-[15px] font-semibold tracking-[0.1em] text-rose">
              0{i + 1} / {s.label}
            </span>
            <h3 className="mb-3 text-[30px]">{s.title}</h3>
            <p className="text-base">{s.body}</p>
          </Card>
        </Reveal>
      ))}
    </div>
  );
}

export function CtaBanner({ title, body, cta, secondary }: { title: ReactNode; body: string; cta: { to: string; label: string }; secondary?: { to: string; label: string } }) {
  return (
    <section className="py-20">
      <div className="container-x">
        <Reveal>
          <div className="relative overflow-hidden cta-glow rounded-[32px] border border-violet-2/35 bg-ink-2 px-10 py-[90px] text-center max-sm:rounded-3xl max-sm:px-5 max-sm:py-16">
            <div className="cta-grid pointer-events-none absolute inset-0 opacity-35" />
            <div className="relative">
              <h2 className="h2 mx-auto mb-[22px] max-w-[820px]">{title}</h2>
              <p className="mb-[38px] text-[19px]">{body}</p>
              <div className="flex flex-wrap justify-center gap-3.5 max-sm:[&>*]:flex-[1_1_100%]">
                <Button to={cta.to} arrow>{cta.label}</Button>
                {secondary && <Button to={secondary.to} variant="ghost">{secondary.label}</Button>}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
