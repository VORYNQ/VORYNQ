import "server-only";
// Solana on-chain tools: read-only lookups through Helius (RPC, DAS and parsed transactions) and pool data from
// GeckoTerminal. Nothing here signs or sends anything. HELIUS_API_KEY is read from the environment and never
// appears in tool results or errors.
import bs58 from "bs58";
import { isSolanaAddress } from "@/shared/address";
import type { ClientTool, ToolContext } from "./tools";

const HELIUS_RPC = "https://mainnet.helius-rpc.com/";
const HELIUS_API = "https://api-mainnet.helius-rpc.com/v0";
const GECKO = "https://api.geckoterminal.com/api/v2/networks/solana";
/** Helius and GeckoTerminal calls one job may make across all Solana tools (the free Helius plan has 1M credits a month). */
const CALLS_PER_JOB = 40;
const TIMEOUT_MS = 12_000;
/** Parsed transactions per page and the most pages one tool call reads. */
const TX_PAGE = 100;
const TX_PAGES_MAX = 3;

const WSOL = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAMS: Record<string, string> = {
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "SPL Token",
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: "Token-2022",
};

const network = () => ({ network: "Solana mainnet", source: "Helius", fetched_at: new Date().toISOString() });
const solscan = (kind: "account" | "token" | "tx", id: string) => `https://solscan.io/${kind}/${id}`;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const round = (n: number, digits = 6) => Number(n.toPrecision(digits));

/** A Solana address from tool input, or a clear error the model can pass on. */
export function solAddress(v: unknown, field: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  let ok = isSolanaAddress(s);
  if (ok) {
    try {
      ok = bs58.decode(s).length === 32;
    } catch {
      ok = false;
    }
  }
  if (!ok) throw new Error(`${field} must be a Solana address (base58, 32-44 characters), got ${JSON.stringify(v).slice(0, 60)}`);
  return s;
}

function heliusKey(): string {
  const key = process.env.HELIUS_API_KEY?.trim();
  if (!key) throw new Error("Solana data is not configured on this server (HELIUS_API_KEY is missing).");
  return key;
}

function spend(ctx: ToolContext) {
  if (ctx.rpcCalls >= CALLS_PER_JOB) throw new Error(`This job reached its limit of ${CALLS_PER_JOB} Solana data calls. Answer with what you have.`);
  ctx.rpcCalls++;
}

/** GET or POST with a timeout; 429 and 5xx are retried twice (1 s, then 2 s). The URL (with the key) never leaks into errors. */
async function fetchJson<T>(ctx: ToolContext, url: string, init: RequestInit, what: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    spend(ctx);
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    } catch {
      if (attempt < 2) continue;
      throw new Error(`${what} did not answer in time. Try again in a moment.`);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`${what} answered with error ${res.status}${res.status === 429 ? " (busy)" : ""}.`);
    return (await res.json()) as T;
  }
}

async function rpc<T>(ctx: ToolContext, method: string, params: unknown): Promise<T> {
  const body = await fetchJson<{ result?: T; error?: { message?: string } }>(
    ctx,
    `${HELIUS_RPC}?api-key=${heliusKey()}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) },
    "The Solana data service"
  );
  if (body.error) throw new Error(`Solana ${method} failed: ${body.error.message ?? "unknown error"}`);
  return body.result as T;
}

// ---------- shapes of the Helius answers used here ----------

type Asset = {
  id: string;
  content?: { metadata?: { name?: string; symbol?: string } };
  token_info?: { balance?: number; supply?: number; decimals?: number; token_program?: string; price_info?: { price_per_token?: number; total_price?: number; currency?: string } };
};
type ParsedTx = {
  signature: string;
  timestamp: number;
  type?: string;
  source?: string;
  description?: string;
  fee?: number;
  feePayer?: string;
  transactionError?: unknown;
  tokenTransfers?: { fromUserAccount?: string; toUserAccount?: string; tokenAmount?: number; mint: string }[];
  nativeTransfers?: { fromUserAccount?: string; toUserAccount?: string; amount?: number }[];
};

/** Name and symbol of up to 50 mints in one DAS call; unknown mints are left out. */
async function tokenNames(ctx: ToolContext, mints: string[]): Promise<Map<string, { name: string | null; symbol: string | null }>> {
  const out = new Map<string, { name: string | null; symbol: string | null }>();
  const ids = [...new Set(mints)].slice(0, 50);
  if (!ids.length) return out;
  try {
    const assets = await rpc<(Asset | null)[]>(ctx, "getAssetBatch", { ids });
    for (const a of assets) if (a) out.set(a.id, { name: a.content?.metadata?.name?.trim() || null, symbol: a.content?.metadata?.symbol?.trim() || null });
  } catch {
    // Names are a nicety: the tool still answers with mint addresses.
  }
  if (!out.has(WSOL)) out.set(WSOL, { name: "Wrapped SOL", symbol: "SOL" });
  return out;
}

/** Up to `pages` pages of parsed transactions touching an address, newest first. */
async function parsedTransactions(ctx: ToolContext, address: string, pages: number): Promise<ParsedTx[]> {
  const all: ParsedTx[] = [];
  let before: string | undefined;
  for (let p = 0; p < pages; p++) {
    const url = `${HELIUS_API}/addresses/${address}/transactions?api-key=${heliusKey()}&limit=${TX_PAGE}${before ? `&before=${before}` : ""}`;
    const page = await fetchJson<ParsedTx[]>(ctx, url, { method: "GET" }, "The Solana transaction service");
    if (!Array.isArray(page) || !page.length) break;
    all.push(...page);
    before = page[page.length - 1].signature;
    if (page.length < TX_PAGE) break;
  }
  return all;
}

function windowOf(txs: ParsedTx[], pagesRead: number) {
  if (!txs.length) return { transactions_read: 0, full_history_read: true, individually_listed: "none", note: "This address has no transactions on record at all." };
  const newest = txs[0].timestamp, oldest = txs[txs.length - 1].timestamp;
  const hours = (newest - oldest) / 3600;
  return {
    transactions_read: txs.length,
    newest: new Date(newest * 1000).toISOString(),
    oldest: new Date(oldest * 1000).toISOString(),
    covers: hours < 1 ? `${Math.round(hours * 60)} minutes` : hours < 48 ? `${round(hours, 3)} hours` : `${round(hours / 24, 3)} days`,
    full_history_read: txs.length < pagesRead * TX_PAGE,
    individually_listed: "Totals cover every transaction read; only the 10 most recent and the 10 largest transfers are listed one by one.",
    note: txs.length < pagesRead * TX_PAGE
      ? "This is every transaction the address has: you may call it the full history."
      : "NOT the full history: older transactions exist and were not read. Say the figures cover only this window, and never say what the address did or did not do before it.",
  };
}

/** "X / Y" → the side that is not the token itself (pool names may carry a fee suffix like "0.05%"). */
const otherToken = (name: string, self: string) => {
  const [a = "", b = ""] = name.split(" / ").map((x) => x.replace(/\s+\d+(\.\d+)?%$/, "").trim());
  return a === self ? b : b === self ? a : `${a} / ${b}`;
};
/** Counts of each value, largest first, with how many items were counted. */
/** How many times each value occurs, largest first: { value: count }. */
const tally = (values: string[]) =>
  Object.fromEntries(Object.entries(values.reduce<Record<string, number>>((m, v) => ((m[v] = (m[v] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]));
const countList = (values: string[]) => ({
  out_of: values.length,
  counts: Object.entries(values.reduce<Record<string, number>>((m, v) => ((m[v] = (m[v] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, pools: n })),
});

/** Ranks where equal values share a rank (1, 1, 3…), with tied_with_others set on shared ranks. */
const withTiedRanks = <T extends Record<string, unknown>,>(rows: T[], key: keyof T) =>
  rows.map((r) => {
    const rank = rows.filter((o) => (o[key] as number) > (r[key] as number)).length + 1;
    const tied = rows.filter((o) => o[key] === r[key]).length > 1;
    return { rank, ...r, ...(tied ? { tied_with_others: true } : {}) };
  });
/** Every item sharing the top value, so a tie is never reported as one winner. */
const firstPlace = <T extends Record<string, unknown>,>(sorted: T[], key: keyof T) => {
  if (!sorted.length) return null;
  const leaders = sorted.filter((r) => r[key] === sorted[0][key]);
  return leaders.length === 1
    ? { tie: false, ...leaders[0] }
    : { tie: true, note: `${leaders.length} items share first place: name all of them, never one as the most.`, leaders };
};

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/** Ranked counts, each with its percent of `total` (all transactions read), so the agent never computes shares. */
const countBy = <T,>(items: T[], key: (t: T) => string | undefined, total = items.length, limit = 10) => {
  const m: Record<string, number> = {};
  for (const i of items) {
    const k = key(i);
    if (k) m[k] = (m[k] ?? 0) + 1;
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, transactions]) => ({ name, transactions, percent_of_transactions_read: pct(transactions, total) }));
};
const appOf = (t: ParsedTx) => (t.source && t.source !== "UNKNOWN" ? t.source : undefined);
/** Types and apps are separate counts: never pair an app with a type unless swaps_by_app says so. */
const activityMix = (txs: ParsedTx[]) => ({
  by_type: countBy(txs, (t) => t.type),
  by_app: countBy(txs, appOf),
  swaps_by_app: countBy(txs.filter((t) => t.type === "SWAP"), appOf, txs.length),
  mix_note: "by_type and by_app count transactions separately; only swaps_by_app links apps to swaps. Percents are of all transactions read.",
});

const pagesFrom = (v: unknown) => {
  if (v === undefined || v === null || v === "") return 1;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("transactions must be a number");
  return Math.min(TX_PAGES_MAX, Math.max(1, Math.ceil(n / TX_PAGE)));
};

// ---------- tools ----------

async function walletOverview(input: { address?: unknown }, ctx: ToolContext) {
  const owner = solAddress(input.address, "address");
  const [assets, account, sigs] = await Promise.all([
    rpc<{ total: number; items: Asset[]; nativeBalance?: { lamports: number; price_per_sol?: number; total_price?: number } }>(ctx, "searchAssets", {
      ownerAddress: owner, tokenType: "fungible", limit: 100, displayOptions: { showNativeBalance: true },
    }),
    rpc<{ value: { executable: boolean; owner: string } | null }>(ctx, "getAccountInfo", [owner, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }]),
    rpc<{ blockTime: number | null }[]>(ctx, "getSignaturesForAddress", [owner, { limit: 1000 }]),
  ]);
  const tokens = assets.items
    .map((a) => {
      const d = a.token_info?.decimals ?? 0;
      const balance = (a.token_info?.balance ?? 0) / 10 ** d;
      return {
        mint: a.id,
        symbol: a.content?.metadata?.symbol?.trim() || null,
        name: a.content?.metadata?.name?.trim() || null,
        balance: round(balance),
        usd_value: a.token_info?.price_info?.total_price !== undefined ? round(a.token_info.price_info.total_price, 4) : null,
      };
    })
    .filter((t) => t.balance > 0)
    .sort((a, b) => (b.usd_value ?? -1) - (a.usd_value ?? -1) || b.balance - a.balance);
  const sol = (assets.nativeBalance?.lamports ?? 0) / 1e9;
  return JSON.stringify({
    address: owner,
    exists: account.value !== null,
    is_program: Boolean(account.value?.executable),
    sol_balance: round(sol),
    sol_usd_value: assets.nativeBalance?.total_price !== undefined ? round(assets.nativeBalance.total_price, 4) : null,
    sol_plus_priced_tokens_usd_value: round((assets.nativeBalance?.total_price ?? 0) + tokens.reduce((a, t) => a + (t.usd_value ?? 0), 0), 10),
    sol_share_of_sol_plus_tokens_percent: pct(assets.nativeBalance?.total_price ?? 0, (assets.nativeBalance?.total_price ?? 0) + tokens.reduce((a, t) => a + (t.usd_value ?? 0), 0)),
    token_count: tokens.length,
    tokens_with_usd_value: tokens.filter((t) => t.usd_value !== null).length,
    tokens_without_price: tokens.filter((t) => t.usd_value === null).length,
    priced_tokens_only_usd_value_excluding_sol: round(tokens.reduce((a, t) => a + (t.usd_value ?? 0), 0), 10),
    tokens: tokens.slice(0, 20).map((t, i) => ({ rank: i + 1, ...t })),
    ...(tokens.length > 20 ? { tokens_not_listed: tokens.length - 20 } : {}),
    ...(assets.total > 100 ? { note: "The wallet holds more than 100 token types; only the first 100 were read." } : {}),
    recent_transactions: sigs.length >= 1000 ? "1000 or more" : sigs.length,
    last_activity: sigs[0]?.blockTime ? new Date(sigs[0].blockTime * 1000).toISOString() : null,
    usd_values_from: "Helius price data, where available",
    ...network(),
    explorer_link: solscan("account", owner),
  });
}

type MintInfo = {
  decimals: number;
  supply: string;
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  isInitialized?: boolean;
  extensions?: { extension: string; state?: Record<string, unknown> }[];
};

async function tokenInfo(input: { token?: unknown; holder?: unknown }, ctx: ToolContext) {
  const mint = solAddress(input.token, "token");
  const holder = input.holder === undefined || input.holder === "" ? null : solAddress(input.holder, "holder");
  const [acct, asset] = await Promise.all([
    rpc<{ value: { owner: string; data: { parsed?: { type?: string; info?: MintInfo } } } | null }>(ctx, "getAccountInfo", [mint, { encoding: "jsonParsed" }]),
    rpc<Asset | null>(ctx, "getAsset", { id: mint }).catch(() => null),
  ]);
  if (!acct.value) throw new Error(`${mint} does not exist on Solana mainnet`);
  const parsed = acct.value.data.parsed;
  if (parsed?.type !== "mint" || !parsed.info) throw new Error(`${mint} is not a token mint (it may be a wallet or a token account)`);
  const info = parsed.info;
  // Token-2022 extensions that change what holders can expect, reported as facts only.
  const ext = (info.extensions ?? []).map((e) => {
    const s = e.state ?? {};
    switch (e.extension) {
      case "transferFeeConfig": {
        const fee = (s.newerTransferFee as { transferFeeBasisPoints?: number } | undefined)?.transferFeeBasisPoints;
        return { extension: e.extension, transfer_fee_percent: fee === undefined ? null : fee / 100 };
      }
      case "permanentDelegate":
        return { extension: e.extension, delegate: s.delegate ?? null, meaning: "this address can move or burn any holder's tokens" };
      case "mintCloseAuthority":
        return { extension: e.extension, close_authority: s.closeAuthority ?? null };
      case "pausableConfig":
        return { extension: e.extension, authority: s.authority ?? null, paused: s.paused ?? null };
      default:
        return { extension: e.extension };
    }
  });
  let holderBalance: Record<string, unknown> = {};
  if (holder) {
    const accounts = await rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { uiAmountString: string } } } } } }[] }>(
      ctx, "getTokenAccountsByOwner", [holder, { mint }, { encoding: "jsonParsed" }]
    );
    const total = accounts.value.reduce((s, a) => s + Number(a.account.data.parsed.info.tokenAmount.uiAmountString), 0);
    holderBalance = { holder, holder_balance: round(total) };
  }
  const supply = Number(info.supply) / 10 ** info.decimals;
  const price = asset?.token_info?.price_info?.price_per_token;
  return JSON.stringify({
    token: mint,
    name: asset?.content?.metadata?.name?.trim() || null,
    symbol: asset?.content?.metadata?.symbol?.trim() || null,
    decimals: info.decimals,
    total_supply: round(supply, 12),
    token_program: TOKEN_PROGRAMS[acct.value.owner] ?? acct.value.owner,
    mint_authority: info.mintAuthority ?? null,
    mint_authority_meaning: info.mintAuthority ? "this address can create more tokens" : "no one can create more tokens",
    freeze_authority: info.freezeAuthority ?? null,
    freeze_authority_meaning: info.freezeAuthority ? "this address can freeze holders' token accounts" : "no one can freeze token accounts",
    extensions: ext,
    ...(price !== undefined ? { price_usd: price, price_from: "Helius price data" } : {}),
    ...holderBalance,
    ...network(),
    explorer_link: solscan("token", mint),
  });
}

async function walletActivity(input: { address?: unknown; transactions?: unknown }, ctx: ToolContext) {
  const self = solAddress(input.address, "address");
  const pages = pagesFrom(input.transactions);
  const txs = await parsedTransactions(ctx, self, pages);
  const flows = new Map<string, { in: number; out: number; transfers: number }>();
  const counterparties = new Map<string, number>();
  const largest: { time: string; mint: string; amount: number; direction: "this wallet received from counterparty" | "this wallet sent to counterparty"; counterparty: string | null; signature: string }[] = [];
  let solIn = 0, solOut = 0, failed = 0;
  for (const tx of txs) {
    if (tx.transactionError) failed++;
    for (const t of tx.tokenTransfers ?? []) {
      const dir = t.toUserAccount === self ? "in" : t.fromUserAccount === self ? "out" : null;
      if (!dir || !t.tokenAmount) continue;
      const f = flows.get(t.mint) ?? { in: 0, out: 0, transfers: 0 };
      f[dir] += t.tokenAmount;
      f.transfers++;
      flows.set(t.mint, f);
      const other = dir === "in" ? t.fromUserAccount : t.toUserAccount;
      if (other && other !== self) counterparties.set(other, (counterparties.get(other) ?? 0) + 1);
      largest.push({ time: new Date(tx.timestamp * 1000).toISOString(), mint: t.mint, amount: t.tokenAmount, direction: dir === "in" ? "this wallet received from counterparty" : "this wallet sent to counterparty", counterparty: other ?? null, signature: tx.signature });
    }
    for (const n of tx.nativeTransfers ?? []) {
      if (!n.amount) continue;
      if (n.toUserAccount === self) solIn += n.amount;
      else if (n.fromUserAccount === self) solOut += n.amount;
    }
  }
  const names = await tokenNames(ctx, [...flows.keys()]);
  const label = (m: string) => names.get(m)?.symbol ?? short(m);
  return JSON.stringify({
    address: self,
    window: windowOf(txs, pages),
    failed_transactions: failed,
    ...activityMix(txs),
    sol: { received: round(solIn / 1e9), sent: round(solOut / 1e9) },
    most_common_type: firstPlace(countBy(txs, (t) => t.type, txs.length, 100).map((c) => ({ type: c.name, transactions: c.transactions, percent_of_transactions_read: c.percent_of_transactions_read })), "transactions"),
    most_transferred_token: firstPlace([...flows.entries()].map(([mint, f]) => ({ mint, symbol: label(mint), transfers: f.transfers })).sort((a, b) => b.transfers - a.transfers), "transfers"),
    tokens: [...flows.entries()]
      .map(([mint, f]) => ({ mint, symbol: label(mint), received: round(f.in), sent: round(f.out), net: round(f.in - f.out), transfers: f.transfers }))
      .sort((a, b) => b.transfers - a.transfers)
      .slice(0, 15)
      .map((t, i) => ({ rank_by_transfers: i + 1, ...t })),
    top_counterparties: withTiedRanks([...counterparties.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([address, transfers]) => ({ address, transfers })), "transfers"),
    counterparties_listed: Math.min(counterparties.size, 10),
    counterparty_groups: Object.entries(tally([...counterparties.values()].sort((a, b) => b - a).slice(0, 10).map(String))).map(([transfers, addresses]) => ({ transfers: Number(transfers), addresses })).sort((a, b) => b.transfers - a.transfers),
    most_frequent_counterparty: firstPlace([...counterparties.entries()].sort((a, b) => b[1] - a[1]).map(([address, transfers]) => ({ address, transfers })), "transfers"),
    largest_transfers: largest.sort((a, b) => b.amount - a.amount).slice(0, 10).map((l, i) => ({ rank: i + 1, ...l, symbol: label(l.mint), amount: round(l.amount) })),
    largest_transfers_note: "Ranked by token amount across different tokens; each row's counterparty belongs to that row only.",
    largest_transfers_counts: {
      rows: Math.min(largest.length, 10),
      by_token: tally(largest.slice(0, 10).map((l) => label(l.mint) ?? l.mint)),
      by_direction: tally(largest.slice(0, 10).map((l) => l.direction)),
    },
    recent_newest_first: txs.slice(0, 10).map((t, i) => ({ position: i + 1, time: new Date(t.timestamp * 1000).toISOString(), type: t.type ?? null, app: t.source ?? null, description: t.description || null, signature: t.signature })),
    counterparty_note: "Counterparties are addresses only; who owns them is not known, and two addresses are never assumed to belong to the same person.",
    ...network(),
    explorer_link: solscan("account", self),
  });
}

async function tokenFlows(input: { token?: unknown; transactions?: unknown }, ctx: ToolContext) {
  const mint = solAddress(input.token, "token");
  const pages = pagesFrom(input.transactions);
  const txs = await parsedTransactions(ctx, mint, pages);
  const sent = new Map<string, number>(), received = new Map<string, number>();
  const largest: { time: string; amount: number; from: string | null; to: string | null; type: string | null; app: string | null; signature: string }[] = [];
  let volume = 0, transfers = 0;
  for (const tx of txs) {
    for (const t of tx.tokenTransfers ?? []) {
      if (t.mint !== mint || !t.tokenAmount) continue;
      transfers++;
      volume += t.tokenAmount;
      if (t.fromUserAccount) sent.set(t.fromUserAccount, (sent.get(t.fromUserAccount) ?? 0) + t.tokenAmount);
      if (t.toUserAccount) received.set(t.toUserAccount, (received.get(t.toUserAccount) ?? 0) + t.tokenAmount);
      largest.push({ time: new Date(tx.timestamp * 1000).toISOString(), amount: t.tokenAmount, from: t.fromUserAccount ?? null, to: t.toUserAccount ?? null, type: tx.type ?? null, app: tx.source ?? null, signature: tx.signature });
    }
  }
  const names = await tokenNames(ctx, [mint]);
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([address, amount], i) => ({ rank: i + 1, address, amount: round(amount), percent_of_volume_moved: pct(amount, volume) }));
  return JSON.stringify({
    token: mint,
    symbol: names.get(mint)?.symbol ?? null,
    window: windowOf(txs, pages),
    transfers,
    volume_moved: round(volume),
    ...activityMix(txs),
    top_senders: top(sent),
    top_receivers: top(received),
    largest_transfers: largest.sort((a, b) => b.amount - a.amount).slice(0, 10).map((l, i) => ({ rank: i + 1, ...l, amount: round(l.amount) })),
    address_note: "Senders and receivers are addresses only; pools and programs appear among them. Who owns an address is not known.",
    ...network(),
    explorer_link: solscan("token", mint),
  });
}

type GeckoPool = {
  attributes: {
    name: string; address: string; reserve_in_usd?: string; pool_created_at?: string; base_token_price_usd?: string;
    volume_usd?: Record<string, string>; price_change_percentage?: Record<string, string>;
    transactions?: Record<string, { buys?: number; sells?: number }>;
  };
  relationships?: { dex?: { data?: { id?: string } }; base_token?: { data?: { id?: string } } };
};

async function poolLiquidity(input: { token?: unknown }, ctx: ToolContext) {
  const mint = solAddress(input.token, "token");
  const body = await fetchJson<{ data?: GeckoPool[] }>(ctx, `${GECKO}/tokens/${mint}/pools?page=1`, { method: "GET", headers: { accept: "application/json" } }, "GeckoTerminal");
  const pools = (body.data ?? []).map((p) => {
    const a = p.attributes;
    const num = (v?: string) => (v === undefined || v === null || v === "" ? null : round(Number(v), 8));
    return {
      pool: a.address,
      name: a.name,
      dex: p.relationships?.dex?.data?.id ?? null,
      liquidity_usd: num(a.reserve_in_usd),
      volume_24h_usd: num(a.volume_usd?.h24),
      price_change_24h_percent: num(a.price_change_percentage?.h24),
      trades_24h: a.transactions?.h24 ? { buys: a.transactions.h24.buys ?? 0, sells: a.transactions.h24.sells ?? 0 } : null,
      created: a.pool_created_at ?? null,
    };
  }).sort((a, b) => (b.liquidity_usd ?? 0) - (a.liquidity_usd ?? 0));
  const total = pools.reduce((s, p) => s + (p.liquidity_usd ?? 0), 0);
  const volumeTotal = pools.reduce((s, p) => s + (p.volume_24h_usd ?? 0), 0);
  // The token's own symbol is the part of a pool name that most pools share ("JitoSOL / SOL" → JitoSOL).
  const sides = pools.flatMap((p) => p.name.split(" / ").map((x) => x.trim()));
  const symbolGuess = sides.sort((a, b) => sides.filter((x) => x === b).length - sides.filter((x) => x === a).length)[0] ?? "";
  const byVolume = [...pools].sort((a, b) => (b.volume_24h_usd ?? 0) - (a.volume_24h_usd ?? 0));
  return JSON.stringify({
    token: mint,
    pools_found: pools.length,
    total_liquidity_usd_listed_pools: round(total, 10),
    total_volume_24h_usd_listed_pools: round(volumeTotal, 10),
    top_3_pools_by_dex: tally(pools.slice(0, 3).map((p) => p.dex ?? "unknown")),
    top_3_pools_share_of_liquidity_percent: pct(pools.slice(0, 3).reduce((a, p) => a + (p.liquidity_usd ?? 0), 0), total),
    listed_pools_by_dex: countList(pools.slice(0, 10).map((p) => p.dex ?? "unknown")),
    listed_pools_by_other_token: countList(pools.slice(0, 10).map((p) => otherToken(p.name, symbolGuess))),
    highest_volume_pool: byVolume[0] ? { pool: byVolume[0].pool, name: byVolume[0].name, dex: byVolume[0].dex, volume_24h_usd: byVolume[0].volume_24h_usd } : null,
    pools: pools.slice(0, 10).map((p, i) => ({
      rank_by_liquidity: i + 1, ...p,
      share_of_listed_liquidity_percent: pct(p.liquidity_usd ?? 0, total),
      share_of_listed_volume_percent: pct(p.volume_24h_usd ?? 0, volumeTotal),
      rank_by_volume_among_listed: pools.slice(0, 10).filter((q) => (q.volume_24h_usd ?? 0) > (p.volume_24h_usd ?? 0)).length + 1,
    })),
    ...(pools.length > 10 ? { pools_not_listed: pools.length - 10 } : {}),
    note: pools.length
      ? "Liquidity is the current value held in each pool, as GeckoTerminal reports it; it is not a record of deposits or withdrawals."
      : "GeckoTerminal lists no pools for this token on Solana.",
    source: "GeckoTerminal",
    network: "Solana mainnet",
    fetched_at: new Date().toISOString(),
  });
}

// ---------- definitions ----------

const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });
const ADDRESS = { type: "string", description: "A Solana address (base58)." };
const TX_COUNT = { type: "number", description: `How many recent transactions to read: up to ${TX_PAGE * TX_PAGES_MAX} (default ${TX_PAGE}).` };

export const SOLANA_TOOLS: Record<"wallet_overview" | "token_info" | "wallet_activity" | "token_flows" | "pool_liquidity", ClientTool> = {
  wallet_overview: {
    definition: { type: "function", function: { name: "wallet_overview",
      description: "Reads a Solana wallet live: SOL balance, its token balances (largest first, with USD value where known), whether it is a program, and how many recent transactions it has. Transaction details need wallet_activity.",
      parameters: obj({ address: ADDRESS }, ["address"]) } },
    run: (input, ctx) => walletOverview(input as { address?: unknown }, ctx),
  },
  token_info: {
    definition: { type: "function", function: { name: "token_info",
      description: "Reads a Solana token mint live: name, symbol, decimals, total supply, token program, mint and freeze authority (who can create more or freeze accounts), Token-2022 extensions such as transfer fees, a price where known, and optionally one holder's balance.",
      parameters: obj({ token: { type: "string", description: "The token's mint address." }, holder: { type: "string", description: "Optional Solana wallet to read the balance of." } }, ["token"]) } },
    run: (input, ctx) => tokenInfo(input as { token?: unknown; holder?: unknown }, ctx),
  },
  wallet_activity: {
    definition: { type: "function", function: { name: "wallet_activity",
      description: "Reads up to the 300 most recent transactions of a Solana wallet (100 by default), already decoded: types (swap, transfer…), apps used (Jupiter, Raydium…), SOL and token amounts received and sent, top counterparties and the latest transactions. Covers a window of recent transactions, which the result states.",
      parameters: obj({ address: ADDRESS, transactions: TX_COUNT }, ["address"]) } },
    run: (input, ctx) => walletActivity(input as { address?: unknown; transactions?: unknown }, ctx),
  },
  token_flows: {
    definition: { type: "function", function: { name: "token_flows",
      description: "Reads up to the 300 most recent transactions of a Solana token (100 by default): how much moved, top senders and receivers, largest transfers, and which apps it moved through. Busy tokens may cover only minutes; the result states the window.",
      parameters: obj({ token: { type: "string", description: "The token's mint address." }, transactions: TX_COUNT }, ["token"]) } },
    run: (input, ctx) => tokenFlows(input as { token?: unknown; transactions?: unknown }, ctx),
  },
  pool_liquidity: {
    definition: { type: "function", function: { name: "pool_liquidity",
      description: "Lists a Solana token's trading pools from GeckoTerminal: DEX, current liquidity in USD, 24h volume, 24h price change and trade counts.",
      parameters: obj({ token: { type: "string", description: "The token's mint address." } }, ["token"]) } },
    run: (input, ctx) => poolLiquidity(input as { token?: unknown }, ctx),
  },
};
