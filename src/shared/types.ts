// Shapes returned by the VORYNQ API, used by both server and frontend.
import type { AgentCategoryId, ModelId, ToolId } from "./catalog";
import type { FranchiseStatus } from "./franchise";

export type AgentPublic = {
  slug: string;
  name: string;
  description: string;
  /** Null only for agents created before categories existed. */
  category: AgentCategoryId | null;
  /** Free-form capability tags, separate from the primary category. */
  tags: string[];
  model: ModelId;
  tools: ToolId[];
  priceUsdc: number;
  createdAt: string;
  jobsCompleted: number;
  /** Private agents only take jobs sent with one of their API keys (or by their signed-in owner). */
  apiPrivate: boolean;
  /** Private agents only: access requests are approved at once instead of waiting for the owner. */
  autoApprove: boolean;
  /** Made and run by VORYNQ. Set only by the admin script. */
  official: boolean;
  /** When its AI logo was generated, or null before it has one. Doubles as the logo URL's cache key. */
  logoAt: string | null;
  /** Agent Franchise (test mode): whether operators may open franchises of this agent, and the creator's share of each franchise job. */
  allowFranchise: boolean;
  franchiseCreatorPct: number;
  /** Set when this agent is a franchise: the original agent it runs (null once that was deleted) and whether it takes jobs. */
  franchise: { parent: { slug: string; name: string } | null; status: FranchiseStatus } | null;
  /** Whether the signed-in wallet owns this agent. Sent on single-agent, "my agents", create and edit responses; never on lists. */
  isOwner?: boolean;
  /** Where the send_webhook tool posts. Sent to the owner only. */
  webhookUrl?: string | null;
  /** Where new and failed jobs are announced. Sent to the owner only. */
  notifyUrl?: string | null;
  /** Owner-set daily caps; null means the default in JOB_LIMITS. Sent to the owner only. */
  dailyJobLimit?: number | null;
  customerDailyLimit?: number | null;
};

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export type Job = {
  id: string;
  agentSlug: string;
  status: JobStatus;
  input: string;
  output: string | null;
  error: string | null;
  toolsUsed: string[];
  inputTokens: number;
  outputTokens: number;
  priceUsdc: number;
  /** Payments are not wired up yet; every job runs in test mode and nothing is charged. */
  paymentStatus: "test";
  createdAt: string;
  finishedAt: string | null;
  /** The conversation this job belongs to. Send it back as threadId to continue; null for anonymous jobs. */
  threadId: string | null;
};

export type CreateAgentRequest = {
  name: string;
  description?: string;
  category: AgentCategoryId;
  tags?: string[];
  instructions: string;
  tools: ToolId[];
  model: ModelId;
  priceUsdc: number;
  /** Required when tools include send_webhook. https only. */
  webhookUrl?: string | null;
  /** Optional https URL that receives job.created and job.failed events. */
  notifyUrl?: string | null;
  /** Edits only (PATCH): new agents always start public. */
  apiPrivate?: boolean;
};

export type CreateAgentResponse = { agent: AgentPublic };

/** A job as its agent's owner sees it on the Requests page: the public job plus private review fields. */
export type OwnerJob = Job & {
  agentName: string;
  /** Wallet of the customer if they were signed in when hiring. */
  clientAddress: string | null;
  /** Private note by the owner; customers never see it. */
  note: string | null;
  /** When the owner marked it as checked, or null. */
  reviewedAt: string | null;
  /** 1 for the first run; each owner re-run adds one. */
  attempts: number;
  /** When the latest attempt was queued: createdAt, or the time of the last re-run. Time taken counts from here. */
  queuedAt: string;
};

export type RequestFilters = {
  status?: JobStatus;
  agent?: string;
  q?: string;
  /** YYYY-MM-DD, UTC, inclusive. */
  from?: string;
  to?: string;
  reviewed?: "yes" | "no";
};

/** An agent's API key as its owner sees it. The full key is only returned once, by the create call. */
export type ApiKeyInfo = {
  id: string;
  /** First characters of the key, to tell keys apart (e.g. "vrq_3f9a1c"). */
  prefix: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  /** Jobs started with this key. */
  jobs: number;
  /** Wallet that made this key through an approved access request, or null for keys the owner made. */
  holder: string | null;
};

/** An example job and its ideal answer, written by the owner to train the agent. Owner only. */
export type AgentExample = {
  id: string;
  input: string;
  output: string;
  /** The real job it was saved from on the Requests page, if any. */
  sourceJobId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A knowledge base document of an agent, as listed to its owner (without the text). */
export type KnowledgeDoc = {
  id: string;
  title: string;
  chars: number;
  chunks: number;
  /** False when its parts could not be indexed for search (then only small knowledge bases use it fully). */
  searchable: boolean;
  createdAt: string;
  updatedAt: string;
};

/** pending → approved or rejected; approved → revoked when the owner removes access. Rejected wallets may ask again. */
export type AccessStatus = "pending" | "approved" | "rejected" | "revoked";

/** A wallet's request to use a private agent, as its owner sees it. */
export type AccessRequest = {
  id: string;
  requester: string;
  message: string;
  status: AccessStatus;
  createdAt: string;
  decidedAt: string | null;
};

/** The signed-in wallet's own request to a private agent, with its active key if it made one. */
export type MyAccess = Omit<AccessRequest, "id" | "requester"> & { key: ApiKeyInfo | null };

/** An agent the signed-in wallet owns, with its recent jobs (GET /api/me/agents). */
export type OwnedAgent = { agent: AgentPublic; jobs: Job[] };

export type ApiError = { error: string; fields?: Record<string, string> };

/** Network-wide totals for the home page's live activity panel. */
export type NetworkStats = {
  /** Distinct owners who have at least one agent. */
  agentBusinesses: number;
  /** Franchises whose status is active. */
  activeFranchises: number;
  /** Distinct customers (wallet, API key or IP, as for the daily caps) who hired any agent. */
  uniqueCustomers: number;
  activeAgents: number;
  tasksCompleted: number;
  /** Sum of prices of succeeded jobs (test payments until payments are live). */
  volumeUsdc: number;
  /** Share of finished jobs that succeeded, 0-1; null before any job has finished. */
  successRate: number | null;
};

/** Jobs started on one UTC day (YYYY-MM-DD) and the revenue of those that succeeded (test mode until payments are live). */
export type UsageDay = { date: string; jobs: number; succeeded: number; revenueUsdc: number };

/** How many days of daily usage the server sends: enough for a 90-day view plus the 90 days before it. */
export const USAGE_DAYS = 180;

/** How reliably and quickly an agent finishes jobs, shown publicly on its service page. */
export type AgentPerformance = {
  /** Totals over the last `days` days. */
  days: number;
  succeeded: number;
  failed: number;
  /** succeeded / (succeeded + failed), or null when no job finished in the window. */
  successRate: number | null;
  /** Over succeeded jobs, from hire to result. */
  avgRunSeconds: number | null;
  medianRunSeconds: number | null;
  /** The last 8 weeks, oldest first; weekStart is the Monday (YYYY-MM-DD, UTC). */
  weeks: { weekStart: string; succeeded: number; failed: number; avgRunSeconds: number | null }[];
};

/** One row of the public Launcher dashboard: every agent on the network with its creator and usage. */
export type DashboardAgent = {
  slug: string;
  name: string;
  /** See AgentPublic.logoAt. */
  logoAt: string | null;
  category: AgentCategoryId | null;
  /** Wallet that published the agent (lowercase), or null for agents made before wallet sign-in and not yet claimed. */
  creator: string | null;
  priceUsdc: number;
  createdAt: string;
  /** Jobs run by the agent, whatever their result. */
  timesUsed: number;
  jobsCompleted: number;
  /** Earned from completed jobs (each at the price it ran at). Test mode until payments are live: nothing is actually charged. */
  revenueUsdc: number;
  /** When the agent was last hired, or null if it never was. */
  lastUsedAt: string | null;
  /** Share of finished jobs that succeeded (0-1), or null before any job finished. */
  successRate: number | null;
  /** Average seconds from hire to finished result over succeeded jobs, or null if none. */
  avgRunSeconds: number | null;
};

// Agent Treasury V1 (BUILD_PLAN F3.1), test mode: income is the price of succeeded jobs, nothing is charged.
// AI cost is real money VORYNQ pays DeepSeek, estimated from tokens (job_costs, F1.3).
export const TREASURY_PERIODS = ["7d", "30d", "90d", "all"] as const;
export type TreasuryPeriod = (typeof TREASURY_PERIODS)[number];

export type TreasuryAgent = {
  slug: string;
  name: string;
  jobs: number;
  jobsSucceeded: number;
  /** Test mode: price of succeeded jobs, never charged. */
  testIncomeUsd: number;
  /** Estimated AI cost of every attempt, including failed and cancelled ones. */
  aiCostUsd: number;
  /** Part of aiCostUsd estimated from the job's tokens and the agent's current model (jobs from before cost records). */
  aiCostEstimatedUsd: number;
  /** Test mode: the creator's share of succeeded jobs on franchises of this agent. Already included in testIncomeUsd. */
  royaltyUsd: number;
};

export type TreasuryTotals = Omit<TreasuryAgent, "slug" | "name">;

export type TreasuryEntry = {
  jobId: string;
  agentSlug: string;
  agentName: string;
  status: JobStatus;
  /** True when the owner cancelled the job. */
  cancelled: boolean;
  createdAt: string;
  finishedAt: string | null;
  attempts: number;
  /** The job's price; counted as test income only when the job succeeded. */
  priceUsd: number;
  testIncomeUsd: number;
  aiCostUsd: number;
  /** "recorded" from job_costs, "estimated" from the job's tokens for older jobs, "none" when no model call was made. */
  costSource: "recorded" | "estimated" | "none";
  /**
   * "job": a job on the owner's own agent. "franchise": a job on a franchise the owner operates; income is the operator's share.
   * "royalty": a job on someone's franchise of the owner's agent; income is the creator's share and the AI cost belongs to the operator.
   */
  kind: "job" | "franchise" | "royalty";
  /** The owner's share of the price in percent, for franchise and royalty lines. */
  sharePct: number | null;
};

export type TreasuryReport = {
  period: TreasuryPeriod;
  /** Start of the period (ISO), or null for all time. */
  since: string | null;
  totals: TreasuryTotals;
  agents: TreasuryAgent[];
  entries: TreasuryEntry[];
  /** Entries matching the filters, for paging. */
  total: number;
  page: number;
  pageSize: number;
};
/** Test-mode earnings of franchise jobs that succeeded, split three ways. Nothing is charged or paid yet. */
export type FranchiseEarnings = { creatorUsdc: number; operatorUsdc: number; protocolUsdc: number };

/** A franchise as its creator (on the original agent's page) or its operator (on the Franchise page) sees it. */
export type FranchiseSummary = {
  slug: string;
  name: string;
  logoAt: string | null;
  priceUsdc: number;
  status: FranchiseStatus;
  /** Wallet that runs the franchise. */
  operator: string | null;
  /** The original agent, or null once it was deleted. */
  parent: { slug: string; name: string } | null;
  createdAt: string;
  jobsCompleted: number;
  lastUsedAt: string | null;
  earnings: FranchiseEarnings;
};

/** An agent operators may franchise, with its creator wallet and how many franchises it has. */
export type FranchisableAgent = AgentPublic & { franchises: number; creator: string | null };
