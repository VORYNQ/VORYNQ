// Solana browser wallets (Phantom, Solflare, Backpack…) found through the Wallet Standard: each installed wallet
// registers itself, so no wallet-specific code or SDK is needed here.
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import type { SolanaSignInFeature, SolanaSignInInput, SolanaSignMessageFeature } from "@solana/wallet-standard-features";

export type SolanaWallet = Wallet;

type ConnectFeature = { "standard:connect": { connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }> } };
type DisconnectFeature = { "standard:disconnect": { disconnect: () => Promise<void> } };
type EventsFeature = { "standard:events": { on: (event: "change", listener: (props: { accounts?: readonly WalletAccount[] }) => void) => () => void } };

const features = (w: Wallet) => w.features as Partial<ConnectFeature & DisconnectFeature & EventsFeature & SolanaSignInFeature & SolanaSignMessageFeature>;

/** A wallet VORYNQ can sign in with: on Solana mainnet, able to connect and to sign in or sign a message. */
const usable = (w: Wallet) => {
  const f = features(w);
  return w.chains.some((c) => c === "solana:mainnet") && Boolean(f["standard:connect"]) && Boolean(f["solana:signIn"] || f["solana:signMessage"]);
};

/** Installed Solana wallets right now. */
export function solanaWallets(): SolanaWallet[] {
  if (typeof window === "undefined") return [];
  return getWallets().get().filter(usable);
}

/** Calls `listener` whenever a wallet registers or unregisters (wallets can load after the page). */
export function watchSolanaWallets(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const api = getWallets();
  const offRegister = api.on("register", listener);
  const offUnregister = api.on("unregister", listener);
  return () => {
    offRegister();
    offUnregister();
  };
}

export const supportsSignIn = (w: Wallet) => Boolean(features(w)["solana:signIn"]);

export async function connectWallet(w: Wallet): Promise<WalletAccount | null> {
  const { accounts } = await features(w)["standard:connect"]!.connect();
  return accounts.find((a) => a.chains.some((c) => c === "solana:mainnet")) ?? accounts[0] ?? null;
}

export async function disconnectWallet(w: Wallet) {
  await features(w)["standard:disconnect"]?.disconnect();
}

/** One-step Sign In With Solana: the wallet connects, builds the message from `input` and signs it. */
export async function walletSignIn(w: Wallet, input: SolanaSignInInput) {
  const [out] = await features(w)["solana:signIn"]!.signIn(input);
  return out;
}

/** Signs raw message bytes with a connected account (wallets without solana:signIn). */
export async function walletSignMessage(w: Wallet, account: WalletAccount, message: Uint8Array) {
  const [out] = await features(w)["solana:signMessage"]!.signMessage({ account, message });
  return out;
}

/** Calls `onAccount` with the wallet's account when the user switches account inside the wallet. */
export function watchAccount(w: Wallet, onAccount: (address: string | null) => void): () => void {
  const on = features(w)["standard:events"]?.on;
  if (!on) return () => {};
  return on("change", ({ accounts }) => {
    if (accounts) onAccount(accounts[0]?.address ?? null);
  });
}

export const isMobileBrowser = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** No wallet installed: phones open this page inside the Phantom app; desktops get Phantom's download page. */
export function openWalletInstall() {
  if (isMobileBrowser()) {
    const url = encodeURIComponent(window.location.href);
    const ref = encodeURIComponent(window.location.origin);
    window.location.href = `https://phantom.app/ul/browse/${url}?ref=${ref}`;
  } else {
    window.open("https://phantom.com/download", "_blank", "noopener");
  }
}
