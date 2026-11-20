// Shared helpers for the /api Route Handlers.
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { ApiError } from "@/shared/types";
import { agents } from "./db";

const MAX_BODY_BYTES = 32 * 1024;

export const fail = (status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503, error: string, fields?: Record<string, string>) =>
  Response.json({ error, ...(fields ? { fields } : {}) } satisfies ApiError, { status });

/** Bodies of knowledge base documents: 50,000 characters can take up to 4 bytes each, plus JSON escaping. */
export const KNOWLEDGE_BODY_BYTES = 256 * 1024;

/** Parses a JSON body, rejecting anything over 32 KB (or maxBytes). Returns null when the body is missing or invalid. */
export async function readJson(req: Request, maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown> | "too_large" | null> {
  const text = await req.text().catch(() => "");
  if (Buffer.byteLength(text) > maxBytes) return "too_large";
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Client address for rate limiting. The first X-Forwarded-For hop is set by Next.js or the proxy in front of it. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function ownerMatches(stored: string, token: string | null): boolean {
  if (!token) return false;
  const a = Buffer.from(stored, "hex");
  const b = Buffer.from(hashToken(token), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// "launcher" and "finance" are pages under /agents and "name-check" a route under /api/agents, so no agent may take those slugs.
const RESERVED_SLUGS = new Set(["launcher", "finance", "name-check"]);

/** True for the database error raised when a second agent tries to take a name (see agents_name_unique). */
export const isNameConflict = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "23505" && (err as { constraint_name?: string }).constraint_name === "agents_name_unique";

export async function slugify(name: string): Promise<string> {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "agent";
  let slug = base;
  for (let n = 2; RESERVED_SLUGS.has(slug) || (await agents.slugTaken(slug)); n++) slug = `${base}-${n}`;
  return slug;
}

// Every job spends the operator's DeepSeek credits, so cap usage until payments exist.
export const LIMITS_SERVER = {
  jobsPerDay: Number(process.env.MAX_JOBS_PER_DAY ?? 200),
  jobsPerIp10Min: Number(process.env.MAX_JOBS_PER_IP_10MIN ?? 10),
  agentsPerIpHour: 5,
};

// Counted from the database so the limit holds across serverless instances.
export async function canCreateAgent(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  return (await agents.countByCreatorSince(since, ip)) < LIMITS_SERVER.agentsPerIpHour;
}

// Hosts a signed sign-in message may name: SITE_URL and the Vercel deployment URLs when configured, otherwise the
// Host header (local development). Client-sent headers such as X-Forwarded-Host are never trusted here.
export function siteHosts(req: Request): string[] {
  const configured = [process.env.SITE_URL && new URL(process.env.SITE_URL).host, process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL];
  const hosts = configured.filter((h): h is string => Boolean(h));
  const host = req.headers.get("host");
  // Local development also accepts the Host header, so a dev server on another port than SITE_URL still works.
  if (host && (!hosts.length || process.env.NODE_ENV !== "production")) hosts.push(host);
  return hosts;
}
