"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cancelSignIn, clearAuthError, signIn, signOut, useAuth } from "@/lib/auth";
import { openWalletInstall, solanaWallets, watchSolanaWallets, type SolanaWallet } from "@/lib/solana-wallets";
import { explorerAddressUrl, shortAddress } from "@/shared/address";
import { Icon } from "../ui/Icon";

// Installed Solana wallets, kept fresh as wallets register (they can load after the page).
let walletCache: SolanaWallet[] = [];
const NO_WALLETS: SolanaWallet[] = [];
function subscribeWallets(onChange: () => void) {
  walletCache = solanaWallets();
  return watchSolanaWallets(() => {
    walletCache = solanaWallets();
    onChange();
  });
}
const useSolanaWallets = () => useSyncExternalStore(subscribeWallets, () => walletCache, () => NO_WALLETS);

/** Wallet button used in the header, the mobile menu and the Launcher. Connects a Solana wallet and
 *  signs in with Solana (one free signature, no transaction); once signed in it shows the short address
 *  and opens a menu with the network, the full address and Disconnect. */
export function ConnectWallet({ className = "", full, label = "Connect Wallet" }: { className?: string; full?: boolean; label?: string }) {
  const auth = useAuth();
  const wallets = useSolanaWallets();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Errors show in the menu of the button that started the sign-in (the page can have several).
  const startedHere = useRef(false);
  useEffect(() => {
    if (auth.error && startedHere.current) setOpen(true);
    if (!auth.busy) startedHere.current = false;
  }, [auth.error, auth.busy]);

  const signedIn = auth.address;
  function start(wallet: SolanaWallet) {
    startedHere.current = true;
    void signIn(wallet);
  }

  function onButton() {
    clearAuthError();
    if (auth.busy) return cancelSignIn(); // The wallet popup may have been closed without an answer.
    if (signedIn) return setOpen((o) => !o);
    if (wallets.length === 0) return openWalletInstall();
    if (wallets.length === 1) {
      setOpen(false);
      return start(wallets[0]);
    }
    setOpen((o) => !o); // Several wallets: let the user pick one.
  }

  async function copy() {
    if (!signedIn) return;
    try {
      await navigator.clipboard.writeText(signedIn);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const base = `inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md text-[15px] font-semibold transition disabled:cursor-wait disabled:opacity-70 ${full ? "h-11" : "h-10 px-5"}`;
  const look = !signedIn
    ? "bg-grad text-white shadow-[0_8px_30px_-10px_rgb(123_60_240/0.6)] hover:brightness-110"
    : "border border-line-strong font-mono text-heading hover:bg-surface-2";

  return (
    <div ref={root} className={`relative ${className}`}>
      <button type="button" onClick={onButton} aria-haspopup="menu" aria-expanded={open} disabled={!auth.ready}
        title={auth.busy ? "Click to cancel" : (signedIn ?? undefined)} className={`${base} ${look}`}>
        {auth.busy ? <>{auth.busy === "connecting" ? "Connecting…" : "Sign in your wallet…"}<span aria-hidden="true" className="text-[17px] leading-none opacity-80">×</span><span className="sr-only">(cancel)</span></>
          : !signedIn ? label
          : <><span className="size-2 rounded-[2px] bg-mint" />{shortAddress(signedIn)}</>}
      </button>

      {open && (
        <div role="menu" className={`absolute top-full z-50 mt-2 rounded-xl border border-line-strong bg-ink p-2 text-[14px] shadow-[0_20px_50px_-15px_rgb(0_0_0/0.35)] ${full ? "inset-x-0" : "right-0 w-72"}`}>
          {auth.error && <p role="alert" className="mb-2 rounded-lg bg-magenta/10 px-3 py-2 text-[13px] text-magenta">{auth.error}</p>}

          {!signedIn ? (
            wallets.length > 0 && (
              <>
                <p className="px-3 pt-1 pb-2 text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">Choose a wallet</p>
                {wallets.map((wallet) => (
                  <button key={wallet.name} type="button" role="menuitem" onClick={() => { setOpen(false); start(wallet); }}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left font-medium text-heading hover:bg-surface-2">
                    {wallet.icon ? <img src={wallet.icon} alt="" className="size-6 rounded-md" /> : <span className="grid size-6 place-items-center rounded-md bg-violet-2/15 text-violet-2"><Icon name="wallet" className="size-4" /></span>}
                    {wallet.name}
                  </button>
                ))}
                <p className="px-3 pt-2 pb-1 text-[12px] text-muted">You&apos;ll sign a message to prove you own the wallet. It&apos;s free and sends no transaction.</p>
              </>
            )
          ) : (
            <>
              <div className="px-3 pt-1 pb-3">
                <p className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">Signed in</p>
                <p className="mt-1 font-mono text-[13px] break-all text-heading">{signedIn}</p>
              </div>
              <div className="mb-1 flex items-center gap-2 rounded-lg bg-mint/10 px-3 py-2 text-mint">
                <Icon name="check" className="size-4 flex-none" />
                <span className="text-[13px] font-medium">Solana</span>
              </div>
              <button type="button" role="menuitem" onClick={copy}
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-heading hover:bg-surface-2">
                <Icon name={copied ? "check" : "copy"} className="size-4" />{copied ? "Copied" : "Copy address"}
              </button>
              <a role="menuitem" href={explorerAddressUrl(signedIn)} target="_blank" rel="noopener noreferrer"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-heading hover:bg-surface-2">
                <Icon name="link" className="size-4" />View on explorer
              </a>
              <button type="button" role="menuitem" onClick={() => { setOpen(false); void signOut(); }}
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-magenta hover:bg-magenta/10">
                <Icon name="refresh" className="size-4" />Disconnect
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
