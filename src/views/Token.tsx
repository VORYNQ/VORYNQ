import { TOKEN_DISCLAIMER, TOKEN_FACTS, TOKEN_UTILITY, TOKENOMICS_NOTE } from "../data/content";
import { PageHero } from "../components/layout/PageHero";
import { Button } from "../components/ui/Button";
import { FeatureCard } from "../components/ui/Card";
import { Reveal } from "../components/ui/Reveal";
import { Disclaimer, SectionHead } from "../components/ui/Section";

export default function Token() {
  return (
    <>
      <PageHero
        tag="$VYNQ"
        eyebrow="Ecosystem Access Token"
        title={<><span className="grad-text">$VYNQ:</span> The Ecosystem Access Token</>}
        lead="$VYNQ is the utility token for access, operating capacity and premium tools on Solana, launching in Q4 2026. Customers don't need $VYNQ to buy services: they pay in stablecoins, so pricing stays simple and predictable."
        actions={<>
          <Button to="/whitepaper" arrow>Read the Whitepaper</Button>
          <Button to="/docs" variant="ghost">Read the Docs</Button>
        </>}
      />

      <section className="pt-5 pb-20">
        <div className="container-x grid gap-[22px] sm:grid-cols-2 lg:grid-cols-4">
          {TOKEN_FACTS.map((f, i) => (
            <Reveal key={f.label} delay={i as 0 | 1 | 2 | 3}>
              <div className="h-full rounded-2xl border border-line bg-surface p-7">
                <div className="mb-2.5 text-sm uppercase tracking-[0.12em] text-muted">{f.label}</div>
                <div className={f.small ? "text-[17px] font-medium" : `break-words text-[26px] font-semibold ${f.grad ? "grad-text" : "text-heading"}`}>{f.value}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="py-[120px] max-md:py-[90px]">
        <div className="container-x">
          <SectionHead kicker="Utility" title="What $VYNQ unlocks.">
            $VYNQ is designed to provide access to network capabilities rather than guarantee financial returns.
          </SectionHead>
          <div className="grid gap-[22px] md:grid-cols-3">
            {TOKEN_UTILITY.map((u, i) => (
              <Reveal key={u.title} delay={(i % 3) as 0 | 1 | 2}><FeatureCard {...u} /></Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-[120px] max-md:py-[90px]">
        <div className="container-x">
          <SectionHead kicker="Tokenomics" title="Allocation & vesting." />
          <div className="grid items-center gap-[60px] max-md:gap-11 md:grid-cols-[340px_1fr]">
            <Reveal className="mx-auto w-full max-w-[340px]">
              {/* Neutral ring: no segments until real allocation figures exist. */}
              <div className="relative aspect-square">
                <svg viewBox="0 0 200 200" aria-hidden="true">
                  <defs><linearGradient id="donutGrad" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#9747FF" /><stop offset="1" stopColor="#DFA0BE" /></linearGradient></defs>
                  <circle cx="100" cy="100" r="78" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="26" />
                  <circle cx="100" cy="100" r="78" fill="none" stroke="url(#donutGrad)" strokeWidth="26" strokeDasharray="6 10" opacity=".75" />
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div>
                    <strong className="block text-[34px] font-semibold text-heading">1B</strong>
                    <span className="text-sm text-muted">Proposed supply</span>
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={1} className="min-w-0">
              <div className="rounded-2xl border border-line bg-surface p-9 max-sm:p-6">
                <p className="text-[19px] text-heading">{TOKENOMICS_NOTE}</p>
                <p className="mt-4 text-muted">Proposed total supply: 1,000,000,000 $VYNQ. Target launch: Q4 2026.</p>
              </div>
            </Reveal>
          </div>
          <Disclaimer>{TOKEN_DISCLAIMER}</Disclaimer>
        </div>
      </section>
    </>
  );
}
