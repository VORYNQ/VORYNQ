import "server-only";
// Tells an agent's owner about new and failed jobs by POSTing to the notify URL they set.
// Best effort: a slow or broken endpoint never delays or fails the job itself.
import { safeRequest } from "./net";

export type JobEvent = "job.created" | "job.failed";

type Payload = { agentSlug: string; agentName: string; jobId: string; input: string; error?: string | null };

export async function notifyOwner(url: string | null, event: JobEvent, p: Payload): Promise<void> {
  if (!url) return;
  const body = JSON.stringify({
    event,
    sent_at: new Date().toISOString(),
    agent: { slug: p.agentSlug, name: p.agentName },
    job: {
      id: p.jobId,
      // Enough to recognise the request; the full text is on the Requests page.
      input_preview: p.input.length > 300 ? `${p.input.slice(0, 300)}…` : p.input,
      ...(event === "job.failed" ? { error: p.error ?? null } : {}),
    },
  });
  try {
    const res = await safeRequest(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "VORYNQ-Notify/1.0", "x-vorynq-event": event },
      body,
      maxBytes: 1000,
      timeoutMs: 5000,
      httpsOnly: true,
    });
    if (res.status >= 400) console.warn(`[notify] ${event} for ${p.agentSlug}: HTTP ${res.status}`);
  } catch (err) {
    console.warn(`[notify] ${event} for ${p.agentSlug}:`, err instanceof Error ? err.message : err);
  }
}
