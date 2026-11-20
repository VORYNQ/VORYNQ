// Cloudflare Workers AI over its REST API: agent logos (logo.ts) and knowledge base embeddings (knowledge.ts).
import "server-only";

export const cfConfigured = () => Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);

/** Runs a Workers AI model and returns its `result`. Throws with Cloudflare's own error message on failure. */
export async function cfRun<T>(model: string, body: unknown, timeoutMs = 45_000): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json().catch(() => null)) as { result?: T; errors?: { message: string }[] } | null;
  if (!res.ok || !data?.result) throw new Error(`Workers AI ${res.status}: ${data?.errors?.map((e) => e.message).join("; ") || "no result"}`);
  return data.result;
}
