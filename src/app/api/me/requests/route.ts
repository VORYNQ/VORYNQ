import { jobs } from "@/server/db";
import { fail } from "@/server/http";
import { sessionAddress } from "@/server/session";
import type { JobStatus, OwnerJob, RequestFilters } from "@/shared/types";

const PAGE_SIZE = 25;
const CSV_MAX_ROWS = 5000;
const STATUSES: JobStatus[] = ["queued", "running", "succeeded", "failed"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function filtersFrom(params: URLSearchParams): RequestFilters {
  const status = params.get("status");
  const from = params.get("from");
  const to = params.get("to");
  const reviewed = params.get("reviewed");
  return {
    status: STATUSES.includes(status as JobStatus) ? (status as JobStatus) : undefined,
    agent: params.get("agent")?.slice(0, 80) || undefined,
    q: params.get("q")?.trim().slice(0, 200) || undefined,
    from: from && DAY.test(from) ? from : undefined,
    to: to && DAY.test(to) ? to : undefined,
    reviewed: reviewed === "yes" || reviewed === "no" ? reviewed : undefined,
  };
}

/** One CSV field: quoted, and prefixed when it could be read as a spreadsheet formula. */
function csvField(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(rows: OwnerJob[]): string {
  const head = ["created_at", "finished_at", "agent", "status", "attempts", "price_usdc", "customer_wallet", "input", "output", "error", "tools_used", "input_tokens", "output_tokens", "reviewed_at", "note", "job_id"];
  const lines = rows.map((j) =>
    [j.createdAt, j.finishedAt, j.agentName, j.status, j.attempts, j.priceUsdc, j.clientAddress, j.input, j.output, j.error, j.toolsUsed.join(" "), j.inputTokens, j.outputTokens, j.reviewedAt, j.note, j.id]
      .map(csvField)
      .join(",")
  );
  // BOM so Excel opens it as UTF-8.
  return `﻿${[head.join(","), ...lines].join("\r\n")}\r\n`;
}

// Requests to every agent the signed-in wallet owns. ?format=csv downloads them (up to 5000 rows).
export async function GET(req: Request) {
  const owner = await sessionAddress();
  if (!owner) return fail(401, "Connect your wallet and sign in to see your requests.");
  const params = new URL(req.url).searchParams;
  const filters = filtersFrom(params);

  if (params.get("format") === "csv") {
    const { jobs: rows } = await jobs.forOwner(owner, filters, CSV_MAX_ROWS, 0);
    return new Response(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="vorynq-requests-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  const page = Math.max(1, Math.min(1000, Number(params.get("page")) || 1));
  const { jobs: rows, total } = await jobs.forOwner(owner, filters, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  return Response.json({ jobs: rows, total, page, pageSize: PAGE_SIZE }, { headers: { "cache-control": "no-store" } });
}
