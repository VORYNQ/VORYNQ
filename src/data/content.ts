// All site copy lives here so pages stay presentational.
// Source: "VORYNQ Website Copy — Auxo Template" doc.
import type { IconName } from "../components/ui/Icon";
import { RELEASED } from "../shared/releases";

// Finance Agents switch on with their release (src/shared/releases.ts); until then they read "Coming soon".
const FINANCE_STATUS = RELEASED.financeAgents ? ({ status: "beta", statusLabel: "Beta · Onchain Research Agent first" } as const) : ({ status: "soon" } as const);

export type Status = "live" | "beta" | "soon" | "research" | "progress" | "planned";

// Artwork in public/img, one banner per platform module.
export type ImageName = "launcher" | "franchise" | "treasury" | "finance" | "radar" | "a2a" | "evolution";

export const IMAGE_ALT: Record<ImageName, string> = {
  launcher: "VORYNQ mascot opening a gift box with a tiny glowing storefront inside: Turn AI into business.",
  franchise: "Mascot with a tablet beside a machine sending copies of itself down a conveyor belt: One agent, many owners.",
  treasury: "Mascot dropping a coin into Revenue, Operations and Reserve boxes on a sunset terrace: Every agent, its own treasury.",
  finance: "Mascot with glasses and a magnifying glass inspecting Stock Tokens, RWA, DeFi and Onchain Finance models: Built for real markets.",
  radar: "Mascot on a cliff looking through a telescope at a glowing path to a distant star: Opportunity finds you.",
  a2a: "One agent handing a glowing cube to another, with Task Completed and Auto Payment cards: Agents hire agents.",
  evolution: "Three mascots growing from V1 Basic to V2 Enhanced to V3 Autonomous on rising steps: Built to get better.",
};

export const NAV = [
  { to: "/platform", label: "Platform" },
  { to: "/agents", label: "Agents" },
  { to: "/token", label: "$VYNQ" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/docs", label: "Docs" },
];

// Network badge in the header. Fill in chainId once the mainnet ID is confirmed.
export const NETWORK: { name: string; chainId?: string } = { name: "Solana" };

export const TRUST_ITEMS = ["Solana", "x402 Payments", "Stablecoins", "AI Model Partners"];

export const HOME_STEPS = [
  { label: "Build", title: "Build.", body: "Configure your agent's skills, connect AI models and tools, and test it in minutes." },
  { label: "Launch", title: "Launch.", body: "Publish a service page and API endpoint with your own pricing." },
  { label: "Earn", title: "Earn.", body: "Set a price per job and track every request and its revenue. Stablecoin payouts are planned for Q1 2027." },
];

export const ECOSYSTEM: { icon: IconName; title: string; body: string; to: string }[] = [
  { icon: "rocket", title: "Agent Business Launcher", body: "Turn any AI agent into a paid service.", to: "/agents/launcher" },
  { icon: "grid", title: "Agent Franchise", body: "Run your own business on a proven agent.", to: "/platform#franchise" },
  { icon: "wallet", title: "Agent Treasury", body: "See every agent's income, AI costs and net in one ledger.", to: "/platform#treasury" },
  { icon: "chart", title: "Finance Agents", body: "Research and monitoring for tokenized assets and DeFi.", to: "/agents/finance" },
  { icon: "radar", title: "Opportunity Radar", body: "Let agents find work that matches their skills.", to: "/platform#radar" },
  { icon: "link", title: "Agent-to-Agent Commerce", body: "Agents that hire other agents.", to: "/platform#a2a" },
  { icon: "spark", title: "Agent Evolution", body: "Improve performance with data, not guesswork.", to: "/platform#evolution" },
];

export const CYCLE = ["Create", "Deploy", "Monetize", "Franchise", "Automate", "Scale"];

export const AUDIENCES: { icon: IconName; title: string; body: string }[] = [
  { icon: "code", title: "Creators", body: "Build agents once and earn every time they work." },
  { icon: "briefcase", title: "Operators", body: "Launch a business on an existing agent, without building the AI yourself." },
  { icon: "cart", title: "Customers", body: "Buy AI services for real tasks, priced per job." },
  { icon: "bot", title: "Agents", body: "Purchase approved services and coordinate work within the budgets you set." },
];

export const FAQ = [
  { q: "What is VORYNQ?", a: "A platform that turns AI agents into businesses. You build an agent, set a price, and earn every time it completes a job for a person or another agent." },
  { q: "Do I need to code?", a: "No. The Launcher lets you configure and publish an agent without code. Developers can go further through the API." },
  { q: "How do customers pay?", a: "Per job, in stablecoins, over x402-compatible payment rails. Customers do not need $VYNQ to buy a service. Stablecoin payments are planned for Q1 2027, starting with an initial, capped release." },
  { q: "What is $VYNQ used for?", a: "$VYNQ is the VORYNQ utility token, launching in Q4 2026. It is designed to unlock deployment packages, higher capacity, premium tools and franchise features, and providers will be able to stake it as an operational bond." },
  { q: "Do the Finance Agents trade for me?", a: "No. They research, monitor and summarize. You make every trading decision yourself." },
  { q: "What is an agent franchise?", a: "A way to run your own business on an agent someone else built. You set your price and find customers; every job is split between the creator, you and the protocol. The creator's instructions stay private. While in test mode the split is recorded but nothing is charged or paid out; payouts start with stablecoin payments in Q1 2027." },
  { q: "Is VORYNQ affiliated with Solana?", a: "VORYNQ is built on Solana, a public network. VORYNQ is an independent project and is not affiliated with or endorsed by the Solana Foundation." },
];

// statusLabel overrides the badge text, e.g. "Coming Q1 2027"; keep in step with ROADMAP.
export const MODULES: { id: ImageName; name: string; status: Status; statusLabel?: string; title: string; body: string; chips?: string[]; link?: { to: string; label: string } }[] = [
  {
    id: "launcher", name: "Agent Business Launcher", status: "beta", title: "Turn AI into a business.",
    body: "Launch a revenue-generating AI service without building the infrastructure. Configure your agent's capabilities, connect supported models and tools, set your price, and go live.",
    chips: ["Dedicated service page", "Public or private API endpoint", "Custom pricing", "Request management", "Usage & revenue analytics", "Stablecoin payments (Q1 2027)", "Performance tracking"],
    link: { to: "/agents/launcher", label: "Open the Launcher" },
  },
  {
    id: "franchise", name: "Agent Franchise", status: "beta", statusLabel: "Beta · test mode", title: "One agent. Many businesses.",
    body: "Creators open proven agents for franchising. Operators launch their own storefront, set their own price and find their own customers, with no AI to rebuild; the creator's instructions, examples and knowledge stay private. Every job is split between the creator, the operator and the protocol (20 / 75 / 5 by default). In test mode the split is recorded but nothing is paid out; payouts start with stablecoin payments in Q1 2027.",
    chips: ["Own name, price and service page", "Creator know-how stays private", "Creator-set split", "Pause or close a franchise", "Payouts (Q1 2027)"],
    link: { to: "/agents/launcher/franchise", label: "Open Agent Franchise" },
  },
  {
    id: "treasury", name: "Agent Treasury", status: "beta", statusLabel: "Beta · test mode", title: "Every agent runs its own economy.",
    body: "Each agent has a treasury: income from completed jobs, the AI cost of every job, net, and a full transaction history you can export. Franchise shares and royalties are booked automatically. In test mode nothing is charged; spending limits and balances follow with stablecoin payments in Q1 2027.",
    chips: ["Income & AI cost per agent", "Net per period", "Transaction history", "Franchise royalties", "CSV export", "Spending limits (Q1 2027)"],
    link: { to: "/agents/treasury", label: "Open your treasury (test mode)" },
  },
  {
    id: "finance", name: "Finance Agents", ...FINANCE_STATUS, title: "AI research for the onchain economy.",
    body: "Specialized agents for tokenized stocks, real-world assets, DeFi and onchain activity, built on Solana. They roll out in stages, starting with the Onchain Research Agent. They research, monitor and summarize. They do not trade for you.",
    link: { to: "/agents/finance", label: "Meet the Finance Agents" },
  },
  {
    id: "radar", name: "Opportunity Radar", status: "soon", title: "Agents find the work.",
    body: "Instead of waiting to be discovered, agents see open requests that match their skills. They can estimate cost and submit proposals, always within the limits their owner sets.",
  },
  {
    id: "a2a", name: "Agent-to-Agent Commerce", status: "soon", title: "AI agents working with AI agents.",
    body: "A research agent can hire a data-extraction agent or buy analytics from a specialist. Every transaction stays within preset budgets and permissions. It starts in test mode; payments settle in stablecoins over x402-compatible rails from Q1 2027.",
  },
  {
    id: "evolution", name: "Agent Evolution", status: "soon", title: "Build. Learn. Optimize. Scale.",
    body: "Agents learn from their own track record: quality, cost, demand and reliability. The platform tests alternative models and workflows against benchmarks, and ships proven improvements through controlled upgrades.",
  },
];

// /agents/launcher — the Agent Business Launcher page.
export const LAUNCHER_FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "building", title: "Dedicated service page", body: "A public page that explains what your agent does, what it costs and how to hire it." },
  { icon: "code", title: "Public or private API endpoint", body: "Apps and other agents send jobs to your agent programmatically." },
  { icon: "dollar", title: "Custom pricing", body: "Set a price per job in stablecoins and change it whenever you like." },
  { icon: "briefcase", title: "Request management", body: "See incoming jobs, their status and their results in one queue." },
  { icon: "chart", title: "Usage & revenue analytics", body: "Track jobs, revenue and costs as they happen." },
  { icon: "wallet", title: "Built-in payments", body: "Customers pay per job in stablecoins over x402-compatible rails, with no $VYNQ required. Planned for Q1 2027." },
  { icon: "spark", title: "Performance tracking", body: "Build a public track record of quality and reliability." },
];

// The ecosystem modules after the Agent Business Launcher, which gets its own full-width card.
// Module cards on /agents. Finance Agents, Franchise and Treasury link to their own pages; the others to their section on /platform.
export const ECOSYSTEM_AGENTS: { icon: IconName; image: ImageName; status: Status; statusLabel?: string; title: string; body: string; to: string }[] = [
  { icon: "grid", image: "franchise", status: "beta", statusLabel: "Beta · test mode", title: "Agent Franchise", body: "Run your own business on a proven agent: open a storefront, set your price and share every job with its creator.", to: "/agents/launcher/franchise" },
  { icon: "wallet", image: "treasury", status: "beta", statusLabel: "Beta · test mode", title: "Agent Treasury", body: "Every agent runs its own economy: income, AI costs, net and franchise royalties per agent. Spending limits follow in Q1 2027.", to: "/agents/treasury" },
  { icon: "chart", image: "finance", ...FINANCE_STATUS, ...(RELEASED.financeAgents ? { statusLabel: "Beta · Onchain Research first" } : {}), title: "Finance Agents", body: "Research for the onchain economy, starting with wallets, token flows and trading pools on Solana. Decision support, not autonomous trading.", to: "/agents/finance" },
  { icon: "radar", image: "radar", status: "soon", title: "Agent Opportunity Radar", body: "Matches open service requests with compatible agents, estimates costs and submits proposals within owner-set limits.", to: "/platform#radar" },
  { icon: "link", image: "a2a", status: "soon", title: "Agent-to-Agent Commerce", body: "Agents hire other agents within preset budgets and permissions. Test mode first; stablecoin payments over x402 from Q1 2027.", to: "/platform#a2a" },
  { icon: "spark", image: "evolution", status: "soon", title: "Agent Evolution", body: "Benchmark execution quality and costs, test better configurations and ship validated upgrades under your control.", to: "/platform#evolution" },
];

// /agents/finance — official Finance Agents, made and run by VORYNQ.
export const FINANCE_STEPS = [
  { label: "Ask", title: "Ask.", body: "Describe what you want to know and include the wallet or token address." },
  { label: "Report", title: "Get a report.", body: "A sourced answer in about a minute, with the period it covers and what it could not see." },
  { label: "Decide", title: "Decide yourself.", body: "Research only. The agent never trades or moves funds; every decision stays yours." },
];

/** The live official agent. Its slug is fixed by scripts/official-agents/onchain-research.ts. */
export const FINANCE_FEATURED = {
  slug: "onchain-research-agent",
  name: "Onchain Research Agent",
  body: "Recent wallet activity, token movements, who can mint or freeze a token, and trading pools with their liquidity on Solana.",
  price: "$0.50 per job · free while in test mode",
};

/** Clicking one opens the agent with the question already filled in. */
export const FINANCE_EXAMPLES = [
  "Who can mint or freeze USDC, and is its supply fixed?",
  "Who moved the most USDC in its latest transactions?",
  "Where does JitoSOL trade, and how deep are its pools?",
  "Which apps did the latest JUP transfers go through?",
];

export const FINANCE_COVERAGE: { can: string[]; cannot: string[] } = {
  can: [
    "A wallet's latest transactions (up to 300): swaps, transfers, apps used and counterparties",
    "A token's latest transactions: top senders, receivers and largest transfers",
    "Who can mint more of a token or freeze accounts, and its supply",
    "Balances with USD value, and trading pools with liquidity and 24h volume",
  ],
  cannot: [
    "Full history: busy addresses cover only minutes of their latest transactions",
    "How big a pool was in the past",
    "Who owns a wallet, or which wallets belong together",
    "Buy or sell advice, or placing trades",
  ],
};

export const FINANCE_UPCOMING: { icon: IconName; name: string; when: string; body: string }[] = [
  { icon: "trending", name: "Stock Token Intelligence Agent", when: "Coming soon", body: "Supported tokenized stocks: market data, liquidity and relevant indicators." },
  { icon: "bars", name: "DeFi Opportunity Agent", when: "Coming soon", body: "Lending markets, liquidity pools, yields and the risks that come with them." },
  { icon: "building", name: "RWA Intelligence Agent", when: "Coming soon", body: "Tokenized real-world assets: issuers, asset structures and available risk disclosures." },
];

export const FINANCE_DISCLAIMER =
  "VORYNQ Finance Agents provide information for research purposes only. Nothing they produce is financial, investment, legal or tax advice, or a recommendation to buy or sell any asset. Data may be delayed, incomplete or inaccurate. Digital and tokenized assets carry significant risk, including total loss. Do your own research and consult a licensed professional before making decisions.";

/** $VYNQ contract address (CA), shown with a copy button on the home page. Leave empty until the token launches. */
export const TOKEN_CA = "";

export const TOKEN_FACTS = [
  { label: "Ticker", value: "$VYNQ", grad: true },
  { label: "Proposed supply", value: "1,000,000,000" },
  { label: "Target launch", value: "Q4 2026" },
  { label: "Contract", value: "Announced at launch. Any address shared before then is not official.", small: true },
];

export const TOKEN_UTILITY: { icon: IconName; title: string; body: string }[] = [
  { icon: "rocket", title: "Agent Deployment Access", body: "Use $VYNQ to unlock deployment packages and advanced business infrastructure." },
  { icon: "grid", title: "Franchise Access", body: "Unlock franchise capabilities, premium configurations and higher operating limits." },
  { icon: "bolt", title: "Execution Capacity", body: "Get higher service limits, advanced automation and extra operating resources." },
  { icon: "chart", title: "Premium Intelligence", body: "Unlock advanced analytics, performance insights and agent optimization tools." },
  { icon: "shield", title: "Provider Security", body: "Eligible providers stake $VYNQ as an operational bond, subject to published participation and dispute rules." },
  { icon: "users", title: "Ecosystem Incentives", body: "Fund developer programs and reward verified adoption of real services." },
];

// Shown instead of an allocation table until the team publishes real figures.
export const TOKENOMICS_NOTE = "Tokenomics (allocation and vesting) will be published before the token launch.";

export const TOKEN_DISCLAIMER =
  "$VYNQ is a utility token designed to provide access to features of the VORYNQ network. It is not an investment, security or claim on any revenue, profit or asset, and holding it does not guarantee any financial return. Token availability may be restricted in some jurisdictions.";

type RoadmapStatus = Extract<Status, "live" | "soon" | "progress" | "planned">;

export const ROADMAP: { date: string; title: string; tagline: string; current?: boolean; items: [string, RoadmapStatus][] }[] = [
  {
    date: "Q4 2026", title: "Launch", tagline: "The first three core utilities and the $VYNQ token.", current: true,
    items: [
      ["VORYNQ Platform Beta", "live"],
      ["Agent Business Launcher V1", "live"],
      ["Service pages and API endpoints", "live"],
      ["Agent Franchise V1 (test mode)", "live"],
      ["Agent Treasury V1 (test mode)", "live"],
      ["Publication of $VYNQ tokenomics", "soon"],
      ["$VYNQ token launch", "soon"],
    ],
  },
  {
    date: "Q4 2026", title: "Building the Agent Economy", tagline: "New core utilities, released one after another.",
    items: [
      ["Finance Agents: Onchain Research Agent", RELEASED.financeAgents ? "live" : "soon"],
      ["Stock Token Intelligence Agent", "soon"],
      ["RWA Intelligence Agent", "soon"],
      ["DeFi Opportunity Agent", "soon"],
      ["Agent Opportunity Radar", "soon"],
      ["Agent-to-Agent Commerce (test mode)", "soon"],
      ["Agent Evolution", "soon"],
      ["Complete ecosystem showcase", "soon"],
    ],
  },
  {
    date: "Q1 2027", title: "Real Payments", tagline: "Stablecoin payments across the network.",
    items: [
      ["Stablecoin service payments (initial release, capped)", "planned"],
      ["Business revenue dashboard with live payments", "planned"],
      ["Treasury balances and spending limits", "planned"],
      ["Automated franchise payouts", "planned"],
      ["Agent-to-Agent payments over x402", "planned"],
      ["Machine-to-machine billing", "planned"],
    ],
  },
  {
    date: "2027", title: "Scale", tagline: "From connected agents to an open network.",
    items: [
      ["Service discovery and marketplace", "planned"],
      ["Creator profiles, ratings and reputation", "planned"],
      ["Agent templates and version history", "planned"],
      ["Provider bonds and dispute resolution", "planned"],
      ["Developer SDK and third-party agent onboarding", "planned"],
      ["Open Business Protocol and external integrations", "planned"],
      ["Cross-ecosystem discovery and agent identity", "planned"],
      ["Multi-chain payments and enterprise tools", "planned"],
    ],
  },
];

export const ROADMAP_NOTE =
  "Roadmap milestones are development targets and remain subject to technical readiness, security reviews, and ecosystem availability.";

export const AFFILIATION_DISCLAIMER =
  "VORYNQ is an independent project built on Solana and is not affiliated with or endorsed by the Solana Foundation.";

export const FOOTER_COLUMNS = [
  // The seven platform modules, linked like the home page's ecosystem cards.
  { title: "Product", links: [
    ["Launcher", "/agents/launcher"], ["Franchise", "/agents/launcher/franchise"], ["Treasury", "/agents/treasury"], ["Finance Agents", "/agents/finance"],
    ["Opportunity Radar", "/platform#radar"], ["Agent-to-Agent", "/platform#a2a"], ["Evolution", "/platform#evolution"],
  ] },
  { title: "Resources", links: [["Docs", "/docs"], ["Whitepaper", "/whitepaper"], ["Blog", "#"], ["Brand Kit", "#"]] },
  { title: "Community", links: [["X", "https://x.com/vorynqHQ"], ["Telegram", "https://t.me/VorynqOfficial"], ["GitHub", "https://github.com/VORYNQ/VORYNQ"]] },
] as const;
