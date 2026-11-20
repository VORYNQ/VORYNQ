import { agents, logos } from "@/server/db";
import { fail } from "@/server/http";
import { generateLogo, logoConfigured } from "@/server/logo";
import { ownedAgent } from "@/server/owned-agent";

// The agent's AI logo. An agent without one gets it generated on the first request (once).
export async function GET(req: Request, ctx: RouteContext<"/api/agents/[slug]/logo">) {
  const agent = await agents.bySlug((await ctx.params).slug);
  if (!agent) return fail(404, "Agent not found.");
  let logo = await logos.get(agent.id);
  if (!logo && (await generateLogo(agent))) logo = await logos.get(agent.id);
  if (!logo) return fail(404, "This agent has no logo yet.");

  // URLs carry ?v=<logoAt>, so a versioned URL never changes and can be cached for good.
  const versioned = new URL(req.url).searchParams.get("v") === logo.createdAt;
  return new Response(new Uint8Array(logo.image), {
    headers: {
      "content-type": logo.contentType,
      "cache-control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
    },
  });
}

// Owner only: replaces the logo with a newly generated one.
export async function POST(_req: Request, ctx: RouteContext<"/api/agents/[slug]/logo">) {
  const owned = await ownedAgent((await ctx.params).slug);
  if ("error" in owned) return owned.error;
  if (!logoConfigured()) return fail(503, "Logo generation is not set up on this server.");
  if (owned.agent.logoAt && Date.now() - Date.parse(owned.agent.logoAt) < 20_000) return fail(429, "Wait a few seconds before making another logo.");
  const logoAt = await generateLogo(owned.agent, { force: true });
  if (!logoAt) return fail(503, "Could not make a logo right now. Please try again.");
  return Response.json({ logoAt });
}
