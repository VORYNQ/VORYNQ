import { IMAGE_ALT, MODULES } from "../data/content";
import { PageHero } from "../components/layout/PageHero";
import { ScrollToHash } from "../components/ScrollToHash";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Reveal } from "../components/ui/Reveal";
import { CtaBanner, StatusBadge } from "../components/ui/Section";

export default function Platform() {
  return (
    <>
      <ScrollToHash />
      <PageHero
        tag="7"
        eyebrow="Building blocks"
        title={<>The Agent <span className="grad-text">Business Platform</span></>}
        lead="Seven building blocks that turn AI agents into businesses that earn, spend and grow on their own."
        actions={<>
          <Button to="/agents/launcher/new" arrow>Launch an Agent</Button>
          <Button to="/roadmap" variant="ghost">View Roadmap</Button>
        </>}
      />

      <section className="pt-10 pb-[120px] max-md:pb-[90px]">
        <div className="container-x">
          {MODULES.map((m, i) => (
            <article key={m.id} id={m.id} className="scroll-mt-28 border-t border-line py-[70px] max-md:py-[50px]">
              <div className="grid items-center gap-14 max-lg:gap-9 lg:grid-cols-2">
                {/* Image alternates sides on desktop; always under the text on mobile. */}
                <Reveal delay={1} className={i % 2 ? "lg:order-first" : ""}>
                  <Banner name={m.id} alt={IMAGE_ALT[m.id]} />
                </Reveal>
                <Reveal className="max-lg:order-first">
                  <div className="mb-6 flex flex-wrap items-center gap-3">
                    <span className="text-[15px] tracking-[0.1em] text-muted">MODULE 0{i + 1}</span>
                    <span className="text-muted/50">·</span>
                    <span className="text-[17px] font-semibold text-heading">{m.name}</span>
                    <StatusBadge status={m.status} label={m.statusLabel} />
                  </div>
                  <h3 className="mb-[18px] text-[clamp(28px,3vw,40px)]">{m.title}</h3>
                  <p className="text-lg">{m.body}</p>
                  {m.chips && (
                    <div className="mt-[26px] flex flex-wrap gap-2.5" aria-label="Every agent gets">
                      {m.chips.map((c) => (
                        <span key={c} className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm">{c}</span>
                      ))}
                    </div>
                  )}
                  {m.link && <div className="mt-7"><Button to={m.link.to} variant="ghost" size="sm" arrow>{m.link.label}</Button></div>}
                </Reveal>
              </div>
            </article>
          ))}
          <div className="border-t border-line" />
        </div>
      </section>

      <CtaBanner
        title={<>Start with the Launcher. <span className="grad-text">Grow into the network.</span></>}
        body="Deploy your first AI business on the VORYNQ beta."
        cta={{ to: "/agents/launcher/new", label: "Launch an Agent" }}
      />
    </>
  );
}
