// Options for the agent Launcher, shared by the frontend form and the API's validation.

export const MODELS = [
  { id: "deepseek-flash", label: "VORYNQ Flash", note: "Fast and low-cost. A good default for everyday jobs." },
  { id: "deepseek-v4-pro", label: "VORYNQ Pro", note: "Thinks before answering. Slower and about 3x the cost, better for analysis and multi-step jobs." },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];
export const DEFAULT_MODEL: ModelId = "deepseek-flash";

export const TOOLS = [
  { id: "crypto_price", label: "Crypto prices", description: "Live token prices and 24h change from CoinGecko." },
  { id: "wallet_overview", label: "Wallet lookup", description: "SOL balance, token balances and recent activity count of a Solana wallet." },
  { id: "token_info", label: "Token info", description: "Name, symbol, supply and mint/freeze authority of a Solana token." },
  { id: "wallet_activity", label: "Wallet activity", description: "Recent decoded transactions, swaps and counterparties of a Solana wallet." },
  { id: "token_flows", label: "Token flows", description: "Top senders, receivers and largest recent transfers of a Solana token." },
  { id: "pool_liquidity", label: "Pool liquidity", description: "Trading pools of a Solana token with liquidity, 24h volume and trades." },
  { id: "read_webpage", label: "Read web page", description: "Reads the text of a public web page from its URL. Cannot search." },
  { id: "analyze_table", label: "Table analysis", description: "Exact stats, groups and period growth from a pasted CSV or table." },
  { id: "calculator", label: "Calculator", description: "Exact arithmetic for numbers in the job." },
  { id: "current_time", label: "Current time", description: "Today's date and time in UTC." },
  { id: "send_webhook", label: "Send webhook", description: "Posts job results to a webhook URL you set. Customers cannot change it." },
] as const;

export type ToolId = (typeof TOOLS)[number]["id"];

// Transaction-history and pool tools use many Helius credits per call, so creators cannot pick them yet. An agent gets them by admin script.
const OFFICIAL_ONLY_TOOLS: readonly ToolId[] = ["wallet_activity", "token_flows", "pool_liquidity"];
export const isOfficialOnlyTool = (id: ToolId) => OFFICIAL_ONLY_TOOLS.includes(id);
/** The tools creators can choose in the Launcher and read about in the docs. */
export const LAUNCHER_TOOLS = TOOLS.filter((t) => !isOfficialOnlyTool(t.id));

// Primary business function of an agent. Ids are stored in the database; labels are display-only.
// Capabilities and use cases belong in an agent's tags, not in new categories.
export const AGENT_CATEGORIES = [
  {
    id: "research",
    label: "Research",
    description: "Research, information retrieval, investigation and intelligence gathering.",
    examples: ["Market research", "Competitor research", "Project research", "Onchain research", "Financial information"],
  },
  {
    id: "trading",
    label: "Trading",
    description: "Market analysis, trading intelligence and strategy evaluation. Analysis only: agents do not execute trades.",
    examples: ["Market signals", "Token intelligence", "Portfolio monitoring", "Strategy backtesting", "Market conditions"],
  },
  {
    id: "automation",
    label: "Automation",
    description: "Repetitive tasks, workflows and coordination across supported tools and services.",
    examples: ["API workflows", "Scheduled tasks", "Data collection", "Business processes", "Agent-to-agent delegation"],
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "Turns structured and unstructured data into insights, metrics, reports and assessments.",
    examples: ["Data analytics", "Wallet behavior", "Performance reports", "Market metrics", "Revenue analytics"],
  },
] as const;

export type AgentCategoryId = (typeof AGENT_CATEGORIES)[number]["id"];

export const LIMITS = {
  nameMin: 2,
  nameMax: 40,
  descriptionMax: 140,
  instructionsMin: 20,
  instructionsMax: 4000,
  priceMax: 1000,
  jobInputMax: 8000,
  webhookUrlMax: 500,
  tagsMax: 8,
  tagMax: 24,
  // Training examples are sent with every job, so they are capped to keep jobs cheap.
  examplesMax: 10,
  exampleInputMax: 2000,
  exampleOutputMax: 4000,
  // Knowledge base: documents per agent, their total size, and title length.
  knowledgeDocsMax: 20,
  knowledgeCharsMax: 50_000,
  knowledgeTitleMax: 80,
} as const;

export const isModelId = (v: unknown): v is ModelId => MODELS.some((m) => m.id === v);
export const isToolId = (v: unknown): v is ToolId => TOOLS.some((t) => t.id === v);
export const isAgentCategoryId = (v: unknown): v is AgentCategoryId => AGENT_CATEGORIES.some((c) => c.id === v);
export const categoryInfo = (id: AgentCategoryId) => AGENT_CATEGORIES.find((c) => c.id === id)!;

/** Agent names are unique ignoring case, compared after trimming and collapsing whitespace. */
export const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ");
export const NAME_TAKEN = "Another agent already uses this name. Pick a different one.";

// Names kept for official VORYNQ agents. Compared without case, spaces or punctuation, so "On-chain research agent" counts too.
const nameKey = (name: string) => name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
const RESERVED_NAMES = new Set(["Onchain Research Agent"].map(nameKey));
export const isReservedName = (name: string) => RESERVED_NAMES.has(nameKey(name));

/** Trims, collapses whitespace and drops empty or case-insensitive duplicate tags. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().replace(/\s+/g, " ");
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

// Daily job caps while VORYNQ pays the AI cost of every job (BUILD_PLAN F1.1, F1.2). Owners pick a cap up to
// the max on their agent's page; null keeps the default. The free quota counts one user's jobs across all agents.
export const JOB_LIMITS = {
  agentDailyDefault: 20,
  agentDailyMax: 50,
  customerDailyDefault: 5,
  customerDailyMax: 20,
  freeJobsPerUserDay: 20,
};

// DeepSeek list prices in USD per million tokens, at the peak-hour cache-miss rate so estimates are an upper bound.
// Checked 2026-11-11 at https://api-docs.deepseek.com/quick_start/pricing (off-peak is half; cache hits cost far less).
export const MODEL_PRICES: Record<ModelId, { input: number; output: number }> = {
  "deepseek-flash": { input: 0.3, output: 1.2 },
  "deepseek-v4-pro": { input: 1.32, output: 3.96 },
};

/** Estimated AI cost in USD of the given token counts (an upper bound, see MODEL_PRICES). */
export const estimateCostUsd = (model: ModelId, inputTokens: number, outputTokens: number) =>
  (inputTokens * MODEL_PRICES[model].input + outputTokens * MODEL_PRICES[model].output) / 1_000_000;
