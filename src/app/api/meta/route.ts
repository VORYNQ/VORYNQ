import { AGENT_CATEGORIES, LAUNCHER_TOOLS, LIMITS, MODELS } from "@/shared/catalog";

export function GET() {
  return Response.json({
    categories: AGENT_CATEGORIES,
    models: MODELS,
    tools: LAUNCHER_TOOLS,
    limits: LIMITS,
    credentialsConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
    paymentsEnabled: false,
  });
}
