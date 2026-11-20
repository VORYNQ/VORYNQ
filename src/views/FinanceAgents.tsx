import Link from "next/link";
import { FINANCE_COVERAGE, FINANCE_DISCLAIMER, FINANCE_EXAMPLES, FINANCE_FEATURED, FINANCE_STEPS, FINANCE_UPCOMING, IMAGE_ALT } from "../data/content";
import { PageHero } from "../components/layout/PageHero";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { OfficialBadge } from "../components/ui/OfficialBadge";
import { Reveal } from "../components/ui/Reveal";
import { CtaBanner, Disclaimer, SectionHead, StatusBadge, StepCards } from "../components/ui/Section";
import { RELEASED } from "../shared/releases";

const agentUrl = `/agents/${FINANCE_FEATURED.slug}`;
// Long addresses are shortened on the cards; the link carries the full question.
const shortAddresses = (text: string) => text.replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, (a) => `${a.slice(0, 4)}…${a.slice(-4)}`);

/**
 * /agents/finance: the official Finance Agents, made and run by VORYNQ. Until RELEASED.financeAgents is switched on
 * the page announces them as coming soon, with no way to hire the agent yet.
 */
export default function FinanceAgents() {
  const live = RELEASED.financeAgents;
  return (
    <>
      <PageHero
        compact
        crumbs={[{ to: "/agents", label: "Agents" }]}
        tag="OFFICIAL"
        eyebrow="Finance Agents"
        title={<>Research the <span className="grad-text">onchain economy.</span></>}
        lead={live
          ? "Official agents built and run by VORYNQ on Solana. Ask a question, get a sourced report. They never trade for you."
          : "Official agents built and run by VORYNQ on Solana, coming soon. Ask a question, get a sourced report. They never trade for you."}
      />

      <section className="pt-5 pb-16">
        <div className="container-x">
          <Reveal>
            <div className="glass-card grid items-center gap-8 p-6 hover:translate-y-0 sm:p-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
              <Banner name="finance" alt={IMAGE_ALT.finance} sizes="(min-width: 1024px) 560px, 100vw" className="rounded-[20px]" eager />
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-2.5">
                  <StatusBadge status={live ? "live" : "soon"} />
                  <OfficialBadge />
                </div>
                <h2 className="mb-3 text-[clamp(28px,3vw,38px)]">{FINANCE_FEATURED.name}</h2>
                <p className="text-[17px]">{FINANCE_FEATURED.body}</p>
                {live ? (
                  <>
                    <p className="mt-3 text-[15px] text-muted">{FINANCE_FEATURED.price}</p>
                    <div className="mt-6 flex flex-wrap gap-3 max-sm:[&>*]:flex-[1_1_100%]">
                      <Button to={`${agentUrl}#hire`} arrow>Ask the agent</Button>
                      <Button to={`${agentUrl}#api`} variant="ghost">Use the API</Button>
                    </div>
                    <Link href="/docs#api-jobs" className="mt-4 inline-block text-sm text-violet-2 hover:underline">Full API reference</Link>
                  </>
                ) : (
                  <p className="mt-5 rounded-xl border border-amber/35 bg-amber/8 px-4 py-3 text-[15px] text-amber">
                    Opening soon. Follow VORYNQ on <a href="https://x.com/vorynqHQ" target="_blank" rel="noopener noreferrer" className="font-semibold underline">X</a> for the release.
                  </p>
                )}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {live && (<section className="pb-16">
        <div className="container-x">
          <SectionHead kicker="Try it" title="Questions you can ask." className="mb-10" />
          <div className="grid gap-4 md:grid-cols-2">
            {FINANCE_EXAMPLES.map((q, i) => (
              <Reveal key={q} delay={(i % 2) as 0 | 1}>
                <Card to={`${agentUrl}?q=${encodeURIComponent(q)}#hire`} className="group flex h-full items-start gap-4 p-6">
                  <span className="grid size-10 flex-none place-items-center rounded-xl bg-violet-2/10 text-violet-2"><Icon name="search" className="size-5" /></span>
                  <span className="flex-1">
                    <span className="block text-[16px] text-heading">{shortAddresses(q)}</span>
                    <span className="mt-2 inline-flex items-center gap-1.5 text-sm text-violet-2">
                      Ask this <span className="transition-transform duration-300 group-hover:translate-x-[3px]">→</span>
                    </span>
                  </span>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>)}

      <section className="pb-16">
        <div className="container-x">
          <SectionHead kicker="Coverage" title="What it can read." className="mb-10">
            Everything comes live from Solana, and every answer states the window it checked.
          </SectionHead>
          <div className="grid gap-4 md:grid-cols-2">
            {([["can", "Can read", "check", "text-mint"], ["cannot", "Can't read", "alert", "text-amber"]] as const).map(([key, title, icon, tone], i) => (
              <Reveal key={key} delay={i as 0 | 1}>
                <div className="h-full rounded-2xl border border-line bg-surface p-6 sm:p-7">
                  <h3 className="mb-4 flex items-center gap-2 text-lg"><Icon name={icon} className={`size-5 ${tone}`} />{title}</h3>
                  <ul className="space-y-3">
                    {FINANCE_COVERAGE[key].map((item) => (
                      <li key={item} className="flex gap-2.5 text-[15.5px]">
                        <span className={`mt-[9px] size-1.5 flex-none rounded-full bg-current ${tone}`} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="container-x">
          <SectionHead kicker="Coming next" title="More finance agents on the way." className="mb-10" />
          <div className="grid gap-4 md:grid-cols-3">
            {FINANCE_UPCOMING.map((a, i) => (
              <Reveal key={a.name} delay={i as 0 | 1 | 2}>
                <div className="h-full rounded-2xl border border-line bg-surface p-6">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <span className="grid size-11 place-items-center rounded-xl bg-violet-2/10 text-violet-2"><Icon name={a.icon} className="size-5" /></span>
                    <StatusBadge status="soon" label={a.when} className="!px-2.5 !py-[3px] !text-xs" />
                  </div>
                  <h3 className="mb-2 text-[19px]">{a.name}</h3>
                  <p className="text-[15px]">{a.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-10">
        <div className="container-x">
          <Reveal>
            <div className="rounded-3xl border border-violet-2/35 bg-[linear-gradient(135deg,rgb(112_40_228/0.22),rgb(223_160_190/0.06)_60%,var(--color-frost))] p-[60px] max-md:px-7 max-md:py-10">
              <span className="kicker">Our principle</span>
              <h2 className="mb-[18px] text-[clamp(30px,3.6vw,44px)]">Decision support, not autopilot.</h2>
              <p className="max-w-[720px] text-[19px]">Our finance agents research and summarize onchain data when you ask. They do not hold your funds or place trades for you. You stay in control of every decision.</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="py-[100px] max-md:py-[80px]">
        <div className="container-x">
          <SectionHead kicker="How you use them" title="Three steps to better information." />
          <StepCards steps={FINANCE_STEPS} />
          <Disclaimer>{FINANCE_DISCLAIMER}</Disclaimer>
        </div>
      </section>

      <CtaBanner
        title={<>Want an agent of <span className="grad-text">your own?</span></>}
        body="Build one in the Launcher: your instructions, your price, your own service page."
        cta={{ to: "/agents/launcher/new", label: "Launch an Agent" }}
      />
    </>
  );
}
