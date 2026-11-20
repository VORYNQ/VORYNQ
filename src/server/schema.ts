// Postgres schema, shared by the app (src/server/db.ts) and scripts/migrate-sqlite-to-supabase.ts.
// Timestamps are stored as ISO-8601 text, which sorts and compares correctly as strings.
// RLS is enabled with no policies, so Supabase's public Data API (anon key) cannot read these tables;
// this server connects as the table owner, which bypasses RLS.
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    instructions TEXT NOT NULL,
    tools TEXT NOT NULL,
    model TEXT NOT NULL,
    price_usdc DOUBLE PRECISION NOT NULL,
    owner_token_hash TEXT NOT NULL,
    creator_ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    status TEXT NOT NULL,
    input TEXT NOT NULL,
    output TEXT,
    error TEXT,
    tools_used TEXT NOT NULL DEFAULT '[]',
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    price_usdc DOUBLE PRECISION NOT NULL,
    client_ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    finished_at TEXT,
    heartbeat_at TEXT
  );
  -- One-time sign-in nonces; each row is deleted when it is used.
  CREATE TABLE IF NOT EXISTS auth_nonces (
    nonce TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL
  );
  -- Wallet ownership. Addresses are stored lowercase; NULL means the agent predates wallet login.
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_address TEXT;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_address TEXT;
  -- Owner-set destination for the send_webhook tool. Private: never sent to anyone but the owner.
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS webhook_url TEXT;
  -- Request management (owner only): where to notify about new and failed jobs, and per-job notes.
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS notify_url TEXT;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS owner_note TEXT;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reviewed_at TEXT;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1;
  -- When the current attempt was queued: created_at for the first run, the re-run time after that.
  -- Run times start here, and the daily job cap counts re-runs through it.
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS queued_at TEXT;
  UPDATE jobs SET queued_at = created_at WHERE queued_at IS NULL;
  CREATE INDEX IF NOT EXISTS jobs_queued ON jobs(queued_at);
  -- API access. A private agent only takes jobs with one of its API keys (or from its signed-in owner).
  -- Keys are stored as SHA-256 hashes; the full key is shown once, when it is created.
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_private BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS api_keys_agent ON api_keys(agent_id, created_at);
  ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS api_key_id TEXT;
  CREATE INDEX IF NOT EXISTS agents_owner ON agents(owner_address, created_at);
  -- DeepSeek retired the deepseek-chat and deepseek-reasoner names.
  UPDATE agents SET model = 'deepseek-flash' WHERE model = 'deepseek-chat';
  UPDATE agents SET model = 'deepseek-v4-pro' WHERE model = 'deepseek-reasoner';
  -- Agent names are unique, ignoring case. While older duplicates remain this is skipped and retried on the next start.
  DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS agents_name_unique ON agents (lower(name));
  EXCEPTION WHEN unique_violation THEN NULL;
  END $$;
  -- One AI-generated logo per agent (Cloudflare Workers AI), served by /api/agents/:slug/logo.
  CREATE TABLE IF NOT EXISTS agent_logos (
    agent_id TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
    image BYTEA NOT NULL,
    content_type TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  ALTER TABLE agent_logos ENABLE ROW LEVEL SECURITY;
  -- Access requests to private agents: one row per agent and wallet. With auto_approve on, requests are approved at once.
  -- An approved requester makes their own key (api_keys.holder_address); NULL there means the owner made the key.
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE TABLE IF NOT EXISTS access_requests (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    requester_address TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    decided_at TEXT,
    UNIQUE (agent_id, requester_address)
  );
  CREATE INDEX IF NOT EXISTS access_requests_agent ON access_requests(agent_id, created_at);
  ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
  ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS holder_address TEXT;
  -- Conversation memory: jobs with the same thread_id and thread_scope continue one conversation.
  -- The scope says whose it is ("wallet:<address>" or "key:<api key id>"), so a guessed thread id opens nothing.
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS thread_id TEXT;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS thread_scope TEXT;
  CREATE INDEX IF NOT EXISTS jobs_thread ON jobs(agent_id, thread_scope, thread_id, created_at);
  -- Training: example jobs with ideal answers, written by the owner and sent with every job of the agent.
  CREATE TABLE IF NOT EXISTS agent_examples (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    input TEXT NOT NULL,
    output TEXT NOT NULL,
    source_job_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS agent_examples_agent ON agent_examples(agent_id, created_at);
  ALTER TABLE agent_examples ENABLE ROW LEVEL SECURITY;
  -- Knowledge base: owner documents, split into chunks with an embedding each (bge-m3, 1024 numbers) for search.
  CREATE TABLE IF NOT EXISTS agent_docs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS agent_docs_agent ON agent_docs(agent_id, created_at);
  ALTER TABLE agent_docs ENABLE ROW LEVEL SECURITY;
  CREATE TABLE IF NOT EXISTS agent_doc_chunks (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES agent_docs(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    text TEXT NOT NULL,
    embedding REAL[]
  );
  CREATE INDEX IF NOT EXISTS agent_doc_chunks_agent ON agent_doc_chunks(agent_id);
  ALTER TABLE agent_doc_chunks ENABLE ROW LEVEL SECURITY;
  -- Agents made and run by VORYNQ itself. Set only by scripts/create-official-agent.ts, never through the API.
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE INDEX IF NOT EXISTS agents_category ON agents(category, created_at);
  CREATE INDEX IF NOT EXISTS agents_creator ON agents(creator_ip, created_at);
  CREATE INDEX IF NOT EXISTS jobs_agent ON jobs(agent_id, created_at);
  CREATE INDEX IF NOT EXISTS jobs_created ON jobs(created_at);
  ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
  ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE auth_nonces ENABLE ROW LEVEL SECURITY;
  -- Owner-set daily job caps (BUILD_PLAN F1.1). NULL means the platform default in JOB_LIMITS.
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS daily_job_limit INTEGER;
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS customer_daily_limit INTEGER;
  -- Who hired the agent, for per-customer caps and the free quota: "wallet:<address>", "key:<api key id>" or "ip:<address>".
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS customer_key TEXT;
  CREATE INDEX IF NOT EXISTS jobs_customer ON jobs(customer_key, created_at);
  -- Estimated AI cost of every attempt of a job, including failed, cancelled and replaced ones (BUILD_PLAN F1.3).
  CREATE TABLE IF NOT EXISTS job_costs (
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    attempt INTEGER NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd DOUBLE PRECISION NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (job_id, attempt)
  );
  ALTER TABLE job_costs ENABLE ROW LEVEL SECURITY;
  -- Launch-update sign-ups from the footer form (BUILD_PLAN F1.4). Read them in the Supabase dashboard.
  CREATE TABLE IF NOT EXISTS waitlist (
    email TEXT PRIMARY KEY,
    ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS waitlist_ip ON waitlist(ip, created_at);
  ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
  -- Agent Franchise, test mode (src/shared/franchise.ts). A franchise is an agents row owned by the operator that points
  -- to the original agent: it has no instructions, examples or knowledge of its own; jobs read the parent's at run time.
  -- franchise_creator_pct NULL means the default (20). No foreign key: a deleted parent leaves its franchises revoked.
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS allow_franchise BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS franchise_creator_pct INTEGER;
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS parent_agent_id TEXT;
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS franchise_status TEXT;
  CREATE INDEX IF NOT EXISTS agents_parent ON agents(parent_agent_id, created_at);
  -- Split of a franchise job, fixed when it is hired: percentages, amounts in micro-units (1 = 0.000001) and both wallets.
  -- Test mode: recorded only, nothing is charged or paid. Only succeeded jobs count as earned.
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS franchise_parent_id TEXT;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS split_creator_pct INTEGER;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS split_operator_pct INTEGER;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS split_protocol_pct INTEGER;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS split_creator_micro BIGINT;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS split_operator_micro BIGINT;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS split_protocol_micro BIGINT;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS split_creator_address TEXT;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS split_operator_address TEXT;
  CREATE INDEX IF NOT EXISTS jobs_franchise_parent ON jobs(franchise_parent_id, created_at);
`;
