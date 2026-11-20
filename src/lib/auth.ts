// Sign In With Solana on the client. One store shared by every Connect Wallet button and by the pages
// that need the signed-in wallet. The session itself is an httpOnly cookie set by /api/auth/verify; this
// store only mirrors which address it belongs to.
import { useSyncExternalStore } from "react";
import { createSignInMessage } from "@solana/wallet-standard-util";
import { connectWallet, disconnectWallet, supportsSignIn, walletSignIn, walletSignMessage, watchAccount, type SolanaWallet } from "./solana-wallets";

export type AuthState = {
  /** Signed-in Solana wallet address (case-sensitive), or null. */
  address: string | null;
  /** False until the session check on page load has finished. */
  ready: boolean;
  busy: "connecting" | "signing" | null;
  error: string | null;
};

let state: AuthState = { address: null, ready: false, busy: null, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<AuthState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

const SERVER_STATE = state;
export function useAuth(): AuthState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      init();
      return () => listeners.delete(l);
    },
    () => state,
    () => SERVER_STATE
  );
}

let started = false;
function init() {
  if (started || typeof window === "undefined") return;
  started = true;
  void refresh();
}

async function refresh() {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    const data = (await res.json()) as { address: string | null };
    set({ address: data.address, ready: true });
  } catch {
    set({ ready: true });
  }
}

/** The wallet used for the current session in this tab, so switching accounts in it can end the session. */
let activeWallet: SolanaWallet | null = null;
let stopWatching: (() => void) | null = null;
function rememberWallet(w: SolanaWallet) {
  stopWatching?.();
  activeWallet = w;
  // Switching to another account inside the wallet ends the session for the old one.
  stopWatching = watchAccount(w, (address) => {
    if (state.address && address && address !== state.address) void signOut();
  });
}

/** Wallet errors: Phantom and others reject with { code: 4001 } or an error whose name or message says so. */
function rejected(err: unknown): boolean {
  for (let e = err as { code?: number; cause?: unknown; name?: string; message?: unknown } | undefined, i = 0; e && i < 5; e = e.cause as typeof e, i++) {
    if (e.code === 4001 || e.name === "UserRejectedRequestError" || e.name === "WalletSignInError" && /reject|denied|cancel/i.test(String(e.message))) return true;
    if (typeof e.message === "string" && /user rejected|user denied|rejected the request/i.test(e.message)) return true;
  }
  return false;
}

/** Which part of sign-in was running when it failed, named in the error so failures can be diagnosed. */
type Phase = "connect" | "server" | "sign" | "verify";
const PHASE_TEXT: Record<Phase, string> = {
  connect: "Couldn't connect the wallet",
  server: "Couldn't reach VORYNQ",
  sign: "The wallet couldn't sign the message",
  verify: "VORYNQ couldn't verify the signature",
};

function describe(err: unknown, phase: Phase): string | null {
  if (rejected(err)) return null;
  if (err instanceof Error && err.message.startsWith("VORYNQ:")) return err.message.slice(8);
  console.error(`[VORYNQ] Wallet sign-in failed (${phase}):`, err);
  const e = err as { code?: number; message?: unknown };
  const text = typeof e?.message === "string" ? e.message.split("\n")[0] : "";
  const code = typeof e?.code === "number" ? ` (code ${e.code})` : "";
  return `${PHASE_TEXT[phase]}${text || code ? `: ${text}${code}` : ". Please try again."}`;
}

const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

const STATEMENT = "Sign in to VORYNQ. This proves you own this wallet. It is free and does not send a transaction.";

// A wallet popup closed without an answer can leave a request hanging; the button acts as Cancel then.
let attempt = 0;

/**
 * Signs in with a Solana wallet: one Sign In With Solana signature (off-chain, free, no transaction).
 * Wallets with the one-step signIn feature build the message themselves; others connect and sign the same text.
 */
export async function signIn(wallet?: SolanaWallet) {
  const id = ++attempt;
  const current = () => id === attempt;
  set({ busy: "connecting", error: null });
  let phase: Phase = "server";
  try {
    const w = wallet ?? activeWallet;
    if (!w) throw new Error("VORYNQ: Choose a wallet to connect.");

    const nonceRes = await fetch("/api/auth/nonce", { method: "POST" });
    if (!nonceRes.ok) throw new Error(`VORYNQ: Can't reach VORYNQ right now (server error ${nonceRes.status}). Please try again.`);
    const { nonce } = (await nonceRes.json()) as { nonce: string };
    if (!current()) return;

    const now = new Date();
    const input = {
      domain: window.location.host,
      statement: STATEMENT,
      uri: window.location.origin,
      version: "1",
      chainId: "mainnet",
      nonce,
      issuedAt: now.toISOString(),
      expirationTime: new Date(now.getTime() + 5 * 60_000).toISOString(),
    };

    let address: string, message: Uint8Array, signature: Uint8Array;
    if (supportsSignIn(w)) {
      set({ busy: "signing" });
      phase = "sign";
      const out = await walletSignIn(w, input);
      ({ signedMessage: message, signature } = out);
      address = out.account.address;
    } else {
      phase = "connect";
      const account = await connectWallet(w);
      if (!account) throw new Error("VORYNQ: The wallet did not share an account. Unlock it and try again.");
      if (!current()) return;
      set({ busy: "signing" });
      phase = "sign";
      address = account.address;
      message = createSignInMessage({ ...input, address });
      ({ signature } = await walletSignMessage(w, account, message));
    }
    if (!current()) return;

    phase = "verify";
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, message: toBase64(message), signature: toBase64(signature) }),
    });
    const data = (await res.json().catch(() => ({}))) as { address?: string; error?: string };
    if (!res.ok || !data.address) throw new Error(`VORYNQ: ${data.error ?? `Sign-in failed on the server (error ${res.status}). Please try again.`}`);
    rememberWallet(w);
    set({ address: data.address, error: null });
  } catch (err) {
    if (current()) set({ error: describe(err, phase) });
  } finally {
    if (current()) set({ busy: null });
  }
}

/** Stops waiting on the wallet; a late answer is ignored. */
export function cancelSignIn() {
  attempt++;
  set({ busy: null });
}

/** Ends the session and disconnects the wallet from this site. */
export async function signOut() {
  attempt++;
  // End the server session before updating the page: pages that re-render on sign-out must not still see the cookie.
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
  set({ address: null, busy: null, error: null });
  stopWatching?.();
  stopWatching = null;
  const w = activeWallet;
  activeWallet = null;
  if (w) await disconnectWallet(w).catch(() => {});
}

export const clearAuthError = () => set({ error: null });
