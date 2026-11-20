import { treasury } from "@/server/db";
import { fail } from "@/server/http";
import { sessionAddress } from "@/server/session";
import { TREASURY_PERIODS, type TreasuryAgent, type TreasuryEntry, type TreasuryPeriod, type TreasuryReport } from "@/shared/types";

const PAGE_SIZE = 25;
const CSV_MAX_ROWS = 5000;
const DAY_MS = 86_400_000;
const PERIOD_DAYS: Record<TreasuryPeriod, number | null> = { "7d": 7, "30d": 30, "90d": 90, all: null };

/** One CSV field: quoted, and prefixed when it could be read as a spreadsheet formula. */
function csvField(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(rows: TreasuryEntry[]): string {
  // Column names carry the test-mode label so a spreadsheet never shows the income as real revenue.
  const head = ["created_at", "finished_at", "agent", "status", "attempts", "line", "share_pct", "price_stablecoin", "test_income_nothing_charged", "ai_cost_usd_real_estimate", "ai_cost_source", "job_id"];
  const lines = rows.map((e) =>
    [e.createdAt, e.finishedAt, e.agentName, e.cancelled ? "cancelled" : e.status, e.attempts, e.kind, e.sharePct, e.priceUsd, e.testIncomeUsd, e.aiCostUsd.toFixed(6), e.costSource, e.jobId].map(csvField).join(",")
  );
  return `﻿${[head.join(","), ...lines].join("\r\n")}\r\n`;
}

const sum = (agents: TreasuryAgent[]) =>
  agents.reduce(
    (t, a) => ({
      jobs: t.jobs + a.jobs,
      jobsSucceeded: t.jobsSucceeded + a.jobsSucceeded,
      testIncomeUsd: t.testIncomeUsd + a.testIncomeUsd,
      aiCostUsd: t.aiCostUsd + a.aiCostUsd,
      aiCostEstimatedUsd: t.aiCostEstimatedUsd + a.aiCostEstimatedUsd,
      royaltyUsd: t.royaltyUsd + a.royaltyUsd,
    }),
    { jobs: 0, jobsSucceeded: 0, testIncomeUsd: 0, aiCostUsd: 0, aiCostEstimatedUsd: 0, royaltyUsd: 0 }
  );

// The signed-in wallet's treasury across all the agents it owns (test mode: nothing is charged).
// ?period=7d|30d|90d|all, ?agent=<slug of one of the owner's agents>, ?page=n, ?format=csv.
export async function GET(req: Request) {
  const owner = await sessionAddress();
  if (!owner) return fail(401, "Connect your wallet and sign in to see your treasury.");
  const params = new URL(req.url).searchParams;
  const p = params.get("period");
  const period: TreasuryPeriod = TREASURY_PERIODS.includes(p as TreasuryPeriod) ? (p as TreasuryPeriod) : "30d";
  const days = PERIOD_DAYS[period];
  const since = days === null ? null : new Date(Date.now() - days * DAY_MS).toISOString();
  // Every query is limited to the owner's agents, so another wallet's slug just matches nothing.
  const agent = params.get("agent")?.slice(0, 80) || null;

  if (params.get("format") === "csv") {
    const { entries } = await treasury.entries(owner, since, agent, CSV_MAX_ROWS, 0);
    return new Response(toCsv(entries), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="vorynq-treasury-test-mode-${period}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  const page = Math.max(1, Math.min(1000, Number(params.get("page")) || 1));
  const [agents, { entries, total }] = await Promise.all([
    treasury.agents(owner, since),
    treasury.entries(owner, since, agent, PAGE_SIZE, (page - 1) * PAGE_SIZE),
  ]);
  const report: TreasuryReport = {
    period, since, agents, entries, total, page, pageSize: PAGE_SIZE,
    totals: sum(agent ? agents.filter((a) => a.slug === agent) : agents),
  };
  return Response.json(report, { headers: { "cache-control": "no-store" } });
}
