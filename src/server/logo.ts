// AI-generated agent logos via Cloudflare Workers AI (FLUX.1 schnell), stored in agent_logos.
import "server-only";
import type { AgentCategoryId } from "@/shared/catalog";
import { cfConfigured, cfRun } from "./cloudflare";
import { logos } from "./db";

const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const SIZE = 256;

type LogoAgent = { id: string; name: string; description: string; category: AgentCategoryId | null };

export const logoConfigured = cfConfigured;

// The shape each category's logos start from, so the category reads at a glance.
const MOTIF: Record<AgentCategoryId, string> = {
  research: "a faceted crystal lens",
  trading: "a rising crystal arrow",
  automation: "interlocking gears",
  analytics: "glowing bar chart pillars",
};

// Quoted or capitalized names and words like "icon" or "label" make FLUX draw lettering,
// so the agent is described as a lowercase concept and the object floats with nothing to write on.
function prompt(a: LogoAgent): string {
  const concept = (a.description || a.name).replace(/["“”.]/g, "").toLowerCase();
  const motif = a.category ? MOTIF[a.category] : "an abstract glowing orb";
  return [
    `Close-up 3D render of one glossy sculpted object that fills most of the frame, symbolizing ${concept}, shaped as ${motif}.`,
    "Floating in mid-air, no pedestal, no base, unlabeled.",
    "Soft studio lighting, smooth gradient background in deep indigo, violet, magenta and warm orange.",
    "Minimal, premium, highly detailed, square composition.",
  ].join(" ");
}

/** Shrinks the 1024px JPEG to a small WebP. Keeps the original if sharp is unavailable. */
async function shrink(jpeg: Buffer): Promise<{ image: Buffer; contentType: string }> {
  try {
    const sharp = (await import("sharp")).default;
    return { image: await sharp(jpeg).resize(SIZE, SIZE, { fit: "cover" }).webp({ quality: 82 }).toBuffer(), contentType: "image/webp" };
  } catch {
    return { image: jpeg, contentType: "image/jpeg" };
  }
}

async function generate(a: LogoAgent): Promise<string> {
  // The REST schema takes only prompt and steps (no seed); each call already gives a different image.
  const { image: b64 } = await cfRun<{ image?: string }>(MODEL, { prompt: prompt(a), steps: 8 });
  if (!b64) throw new Error("Workers AI returned no image.");
  const { image, contentType } = await shrink(Buffer.from(b64, "base64"));
  return logos.save(a.id, image, contentType);
}

// One generation per agent at a time, and a pause after a failure so page views do not retry in a loop.
const inFlight = new Map<string, Promise<string>>();
const failedAt = new Map<string, number>();
const RETRY_AFTER_MS = 5 * 60_000;

/** Generates and stores a new logo. Resolves to its timestamp, or null when not configured or recently failed. */
export function generateLogo(a: LogoAgent, { force = false } = {}): Promise<string | null> {
  if (!logoConfigured()) return Promise.resolve(null);
  const running = inFlight.get(a.id);
  if (running) return running.catch(() => null);
  if (!force && Date.now() - (failedAt.get(a.id) ?? 0) < RETRY_AFTER_MS) return Promise.resolve(null);
  const p = generate(a).finally(() => inFlight.delete(a.id));
  inFlight.set(a.id, p);
  return p.then(
    (at) => (failedAt.delete(a.id), at),
    (err) => {
      failedAt.set(a.id, Date.now());
      console.error(`Logo for agent ${a.id} failed:`, err);
      return null;
    }
  );
}
