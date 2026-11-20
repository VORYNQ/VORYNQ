import Link from "next/link";
import { LauncherForm } from "../components/LauncherForm";
import { RefreshOnSignIn } from "../components/RefreshOnSignIn";
import { ConnectWallet } from "../components/layout/ConnectWallet";
import { HeroGlow } from "../components/layout/PageHero";
import { Icon } from "../components/ui/Icon";
import { NetworkCanvas } from "../components/visual/NetworkCanvas";

/** /agents/launcher/new: the agent setup wizard, shown only to a signed-in wallet. Others get a connect prompt.
 *  Kept compact so the whole wizard fits on a laptop screen without scrolling. */
export default function LauncherNew({ signedIn }: { signedIn: boolean }) {
  return (
    // At least one screen tall, so the site footer stays below the fold while creating an agent.
    <section id="create" className="relative min-h-svh overflow-hidden pt-[92px] pb-12 max-sm:pt-[88px]">
      <RefreshOnSignIn />
      <NetworkCanvas />
      <HeroGlow />
      <div className="container-x relative z-[2]">
        {signedIn ? (
          <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
              <div>
                <nav aria-label="Breadcrumb" className="mb-1 flex gap-2 font-mono text-[12px] tracking-[0.08em] text-muted uppercase">
                  <Link href="/agents/launcher" className="hover:text-heading">Dashboard</Link>
                  <span aria-hidden="true">/</span>
                  <span aria-current="page" className="text-heading">New agent</span>
                </nav>
                <h1 className="text-[clamp(26px,2.6vw,34px)]">Launch your agent <span className="grad-text">in minutes.</span></h1>
              </div>
              <p className="text-sm text-muted">Three short steps. You can edit it later from its page.</p>
            </div>
            <LauncherForm />
          </>
        ) : (
          <div className="mx-auto mt-6 max-w-[560px] rounded-3xl border border-line bg-ink-2/95 px-8 py-14 text-center backdrop-blur-xl max-sm:px-5">
            <span className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-violet-2/15 text-violet-2"><Icon name="wallet" className="size-7" /></span>
            <h1 className="text-[clamp(26px,3vw,36px)]">Connect your wallet to create an agent</h1>
            <p className="mx-auto mt-3 max-w-[440px] text-[16px]">
              Every agent is saved to the wallet that publishes it. Signing in is free: one signature, no transaction and no fee.
            </p>
            <ConnectWallet className="mx-auto mt-7 w-fit" />
            <Link href="/agents/launcher" className="mt-5 inline-block text-sm text-muted hover:text-heading">Back to the dashboard</Link>
          </div>
        )}
      </div>
    </section>
  );
}
