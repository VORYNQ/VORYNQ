import { ROADMAP, ROADMAP_NOTE } from "../data/content";
import { PageHero } from "../components/layout/PageHero";
import { Reveal } from "../components/ui/Reveal";
import { CtaBanner, Disclaimer, StatusBadge } from "../components/ui/Section";

export default function Roadmap() {
  return (
    <>
      <PageHero
        tag="2026–27"
        eyebrow="Shipping in phases"
        title={<span className="grad-text">Roadmap</span>}
        lead="We ship in phases and mark what is live. Here's where VORYNQ is headed."
      />

      <section className="pt-[30px] pb-[120px] max-md:pb-[90px]">
        <div className="container-x">
          <div className="relative mx-auto max-w-[900px] before:absolute before:top-2.5 before:bottom-2.5 before:left-[27px] before:w-0.5 before:bg-[linear-gradient(180deg,#9747ff,rgb(223_160_190/0.4)_60%,rgb(255_255_255/0.06))]">
            {ROADMAP.map((phase, i) => (
              <Reveal key={phase.title} className="relative pb-[60px] pl-[90px] last:pb-0 max-sm:pl-[74px]">
                <span className={`absolute top-0 left-0 grid size-14 place-items-center rounded-full border text-[17px] font-bold ${phase.current ? "text-white bg-grad border-transparent shadow-[0_0_0_8px_rgb(151_71_255/0.15)]" : "border-line-strong bg-ink-2 text-heading"}`}>
                  0{i + 1}
                </span>
                <span className="text-sm font-semibold uppercase tracking-[0.12em] text-rose">{phase.date}</span>
                <h3 className="mt-2 mb-1.5 text-[clamp(26px,3vw,34px)]">{phase.title}</h3>
                <p className="mb-[22px] text-lg">{phase.tagline}</p>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {phase.items.map(([item, status]) => (
                    <li key={item} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-[18px] py-3.5 text-[15.5px] text-heading">
                      <span className="mt-[5px] text-[11px] text-violet-2">◆</span>
                      <span className="flex-1">{item}</span>
                      <StatusBadge status={status} className="flex-none !px-2.5 !py-[3px] !text-xs" />
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
          <div className="mx-auto max-w-[900px]">
            <Disclaimer>{ROADMAP_NOTE}</Disclaimer>
          </div>
        </div>
      </section>

      <CtaBanner
        title={<>Be there for <span className="grad-text">Genesis.</span></>}
        body="Join the VORYNQ beta and deploy your first AI business."
        cta={{ to: "/agents/launcher", label: "Get Early Access" }}
      />
    </>
  );
}
