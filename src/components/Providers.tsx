"use client";

import type { ReactNode } from "react";

/** Site-wide client providers. Solana wallets need none: they are found through the Wallet Standard (see lib/solana-wallets). */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
