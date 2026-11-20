import { networkStats } from "@/server/db";

// Network totals for the home page. Cached briefly at the edge so a busy home page doesn't hit the database on every view.
export async function GET() {
  return Response.json(await networkStats(), { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" } });
}
