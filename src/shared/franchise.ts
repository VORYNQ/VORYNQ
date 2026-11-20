// Agent Franchise (test mode): an operator runs a creator's agent under their own name and price.
// The operator's storefront never holds the creator's instructions, examples or knowledge base:
// the server reads them from the original agent each time a franchise job runs.

export const FRANCHISE = {
  /** VORYNQ's share of every franchise job. Fixed; the creator splits the rest with the operator. */
  protocolPct: 5,
  creatorDefaultPct: 20,
  /** Bounds for the creator's share, so the operator always keeps at least 5%. */
  creatorMinPct: 0,
  creatorMaxPct: 90,
};

export type FranchiseStatus = "active" | "paused" | "revoked";

export const operatorPct = (creatorPct: number) => 100 - FRANCHISE.protocolPct - creatorPct;

/** Amounts in micro-units (1 = 0.000001 stablecoin), so splits add up exactly. The operator gets the rounding remainder. */
export function splitPrice(priceUsdc: number, creatorPct: number) {
  const total = Math.round(priceUsdc * 1_000_000);
  const creator = Math.floor((total * creatorPct) / 100);
  const protocol = Math.floor((total * FRANCHISE.protocolPct) / 100);
  return { creatorPct, operatorPct: operatorPct(creatorPct), protocolPct: FRANCHISE.protocolPct, creator, operator: total - creator - protocol, protocol };
}

export const isCreatorPct = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= FRANCHISE.creatorMinPct && v <= FRANCHISE.creatorMaxPct;
