// Wallet addresses. VORYNQ accounts are Solana wallets: base58 public keys, which are case-sensitive, so they
// are stored and compared exactly as the wallet gives them (never lowercased).

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** A Solana wallet address (base58 public key, 32-44 characters). */
export const isSolanaAddress = (v: unknown): v is string => typeof v === "string" && BASE58.test(v);

/** "7xKX…AsU": the first and last four characters of an address. */
export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** Solscan page of an address. */
export const explorerAddressUrl = (a: string) => `https://solscan.io/account/${a}`;
