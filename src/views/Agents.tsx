import { ECOSYSTEM_AGENTS, type ImageName } from "../data/content";
import { CommunityAgents } from "../components/CommunityAgents";
import { PageHero } from "../components/layout/PageHero";
import { RELEASED } from "../shared/releases";
import { Card } from "../components/ui/Card";
import { Icon, type IconName } from "../components/ui/Icon";
import { Reveal } from "../components/ui/Reveal";
import { CtaBanner, StatusBadge } from "../components/ui/Section";

// Image cards: no outer padding so the artwork runs edge to edge; text sits in an inner padded block.
const imageCard = "flex flex-col p-0 max-sm:p-0 lg:[&_p]:text-[14px] lg:[&_p]:leading-snug short:[&_p]:text-[13.5px]";
// Dark backing so status badges stay readable on the light artwork.
const badgeOnArt = "absolute top-3 right-3 rounded-full bg-ink/85 backdrop-blur";

/** Illustration crop of a module banner (public/img/card-*.webp, made by `npm run images`). Decorative: the card title names it. */
function CardArt({ name, sizes, className = "" }: { name: ImageName; sizes: string; className?: string }) {
  return (
    <img
      src={`/img/card-${name}-480.webp`}
      srcSet={`/img/card-${name}-480.webp 480w, /img/card-${name}-960.webp 960w`}
      sizes={sizes}
      width={480}
      height={300}
      alt=""
      // The cards sit in the first screen, so load the art right away.
      loading="eager"
      decoding="async"
      className={`block w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${className}`}
    />
  );
}

/** Small icon tile that overlaps the bottom edge of the artwork. */
function ArtIcon({ name }: { name: IconName }) {
  return (
    <span className="relative z-[1] -mt-6 mb-3 grid size-11 place-items-center rounded-xl border border-white/15 bg-[linear-gradient(135deg,rgb(112_40_228/0.9),rgb(178_60_255/0.75))] text-white shadow-[0_8px_24px_-8px_rgb(112_40_228/0.9)] short:-mt-5 short:size-10">
      <Icon name={name} className="size-5" />
    </span>
  );
}

export default function Agents() {
  return (
    <>
      <PageHero
        compact
        tag="CHAIN"
        eyebrow="Built on Solana"
        title={<>AI Intelligence for the <span className="grad-text">Onchain Economy.</span></>}
        lead="Seven building blocks that turn AI agents into businesses: launch, franchise and fund them, research markets, find work, trade with other agents and keep improving."
      />

      <section className="pt-5 pb-10">
        {/* Compact cards so all seven fit in one desktop screen: Launcher + 2 on the first row, 4 on the second. */}
        <div className="container-x grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Entry to the Launcher sub-page, styled like the agent cards but spanning two columns. */}
          <Reveal className="md:col-span-2">
            {/* Wide card: text on the left, artwork filling the right half (stacked on phones). */}
            <Card to="/agents/launcher" className={`group ${imageCard} bg-[linear-gradient(135deg,rgb(112_40_228/0.28),rgb(255_79_139/0.08)_60%,transparent)] sm:grid sm:grid-cols-[1fr_46%]`}>
              <div className="relative overflow-hidden sm:order-2">
                <CardArt name="launcher" sizes="(min-width: 1024px) 24vw, (min-width: 640px) 46vw, 100vw" className="h-[150px] sm:h-full" />
                <span className={badgeOnArt}><StatusBadge status="beta" /></span>
              </div>
              <div className="flex flex-col p-6 short:p-5 sm:order-1">
                <span className="mb-3 grid size-11 place-items-center rounded-xl border border-white/15 bg-[linear-gradient(135deg,rgb(112_40_228/0.9),rgb(178_60_255/0.75))] text-white short:size-10">
                  <Icon name="rocket" className="size-5" />
                </span>
                <h3 className="mb-2 text-[22px]">Agent Business Launcher</h3>
                <p className="mb-4 text-[15px]">Build your own agent, set a price per job and publish it with a service page and API endpoint. Stablecoin payments are planned for Q1 2027.</p>
                <span className="btn btn-primary btn-sm mt-auto self-start">
                  Open Launcher <span className="transition-transform duration-300 group-hover:translate-x-[3px]">→</span>
                </span>
              </div>
            </Card>
          </Reveal>
          {ECOSYSTEM_AGENTS.map((a, i) => (
            <Reveal key={a.title} delay={(i % 4) as 0 | 1 | 2 | 3}>
              <Card to={a.to} className={`group ${imageCard}`}>
                <div className="relative overflow-hidden">
                  <CardArt name={a.image} sizes="(min-width: 1024px) 24vw, (min-width: 768px) 46vw, 100vw" className="h-[150px] lg:h-[104px] lg:[@media(max-height:820px)]:h-[70px]" />
                  <span className={badgeOnArt}><StatusBadge status={a.status} label={a.statusLabel} /></span>
                </div>
                <div className="flex flex-1 flex-col px-6 pb-6 short:px-5 short:pb-5">
                  <ArtIcon name={a.icon} />
                  <h3 className="mb-2 text-[20px]">{a.title}</h3>
                  <p className="text-[15px]">{a.body}</p>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      <CommunityAgents />

      {/* The finance principle, steps and disclaimer live on /agents/finance. */}
      <CtaBanner
        title={<>Your agent, <span className="grad-text">your business.</span></>}
        body={RELEASED.financeAgents ? "Launch your own AI agent in minutes on the VORYNQ beta, or start with the official Finance Agents." : "Launch your own AI agent in minutes on the VORYNQ beta."}
        cta={{ to: "/agents/launcher/new", label: "Launch an Agent" }}
        secondary={RELEASED.financeAgents ? { to: "/agents/finance", label: "Meet the Finance Agents" } : undefined}
      />
    </>
  );
}
