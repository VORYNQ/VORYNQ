// Field validation for creating (all fields) and editing (only the fields sent) an agent.
import "server-only";
import { JOB_LIMITS, LIMITS, isAgentCategoryId, isModelId, isOfficialOnlyTool, isToolId, normalizeName, normalizeTags, type AgentCategoryId, type ModelId, type ToolId } from "@/shared/catalog";
import type { AgentUpdate } from "./db";
import { checkPublicUrl } from "./net";

type Fields = Required<AgentUpdate>;

/** A training example: the job and its ideal answer, both required and capped. */
export function validateExample(body: Record<string, unknown>): { ok: { input: string; output: string } } | { errors: Record<string, string> } {
  const input = typeof body.input === "string" ? body.input.trim() : "";
  const output = typeof body.output === "string" ? body.output.trim() : "";
  const errors: Record<string, string> = {};
  if (!input || input.length > LIMITS.exampleInputMax) errors.input = `Write the example job in 1-${LIMITS.exampleInputMax} characters.`;
  if (!output || output.length > LIMITS.exampleOutputMax) errors.output = `Write the ideal answer in 1-${LIMITS.exampleOutputMax} characters.`;
  return Object.keys(errors).length ? { errors } : { ok: { input, output } };
}

/** Returns the cleaned fields, or per-field error messages. With partial, missing fields are skipped. */
export function validateAgent(body: Record<string, unknown>, partial: boolean, heldTools: ToolId[] = []): { ok: AgentUpdate } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const out: AgentUpdate = {};
  const has = (k: string) => !partial || body[k] !== undefined;

  if (has("name")) {
    const name = typeof body.name === "string" ? normalizeName(body.name) : "";
    if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) errors.name = `Use ${LIMITS.nameMin}-${LIMITS.nameMax} characters.`;
    else out.name = name;
  }
  if (has("description")) {
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (description.length > LIMITS.descriptionMax) errors.description = `Keep it under ${LIMITS.descriptionMax} characters.`;
    else out.description = description;
  }
  if (has("category")) {
    if (!isAgentCategoryId(body.category)) errors.category = "Pick a primary category.";
    else out.category = body.category as AgentCategoryId;
  }
  if (has("tags")) {
    const raw = body.tags === undefined ? [] : body.tags;
    const tags = Array.isArray(raw) && raw.every((t) => typeof t === "string") ? normalizeTags(raw) : null;
    if (!tags || tags.length > LIMITS.tagsMax || tags.some((t) => t.length > LIMITS.tagMax))
      errors.tags = `Use up to ${LIMITS.tagsMax} tags of at most ${LIMITS.tagMax} characters.`;
    else out.tags = tags;
  }
  if (has("instructions")) {
    const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
    if (instructions.length < LIMITS.instructionsMin || instructions.length > LIMITS.instructionsMax)
      errors.instructions = `Use ${LIMITS.instructionsMin}-${LIMITS.instructionsMax} characters.`;
    else out.instructions = instructions;
  }
  if (has("tools")) {
    const tools = Array.isArray(body.tools) ? [...new Set(body.tools)] : null;
    // Official-only tools cannot be added here, but an agent that already has one keeps it through an edit.
    if (!tools || !tools.every(isToolId) || tools.some((t) => isOfficialOnlyTool(t as ToolId) && !heldTools.includes(t as ToolId))) errors.tools = "Pick tools from the list.";
    else out.tools = tools as ToolId[];
  }
  if (has("model")) {
    if (!isModelId(body.model)) errors.model = "Pick a model from the list.";
    else out.model = body.model as ModelId;
  }
  if (has("priceUsdc")) {
    const price = typeof body.priceUsdc === "number" ? body.priceUsdc : Number.NaN;
    // Compared with a small tolerance: 0.29 * 100 is 28.999999999999996 in floating point.
    const cents = Math.round(price * 100);
    if (!Number.isFinite(price) || price < 0 || price > LIMITS.priceMax || Math.abs(price * 100 - cents) > 1e-6)
      errors.priceUsdc = `Enter a price from 0 to ${LIMITS.priceMax} with at most 2 decimals.`;
    else out.priceUsdc = cents / 100;
  }

  // Optional owner-set https URLs: empty clears them.
  for (const key of ["webhookUrl", "notifyUrl"] as const) {
    if (!has(key)) continue;
    const raw = body[key] === undefined || body[key] === null ? "" : body[key];
    const url = typeof raw === "string" ? raw.trim() : null;
    if (url === null || url.length > LIMITS.webhookUrlMax) errors[key] = `Use a URL of at most ${LIMITS.webhookUrlMax} characters.`;
    else if (url === "") out[key] = null;
    else {
      try {
        out[key] = checkPublicUrl(url, { httpsOnly: true }).href;
      } catch (err) {
        errors[key] = `${err instanceof Error ? err.message : "Not a valid URL"}.`;
      }
    }
  }
  // New agents always start public; the owner can make one private afterwards.
  if (partial && body.apiPrivate !== undefined) {
    if (typeof body.apiPrivate !== "boolean") errors.apiPrivate = "Choose public or private.";
    else out.apiPrivate = body.apiPrivate;
  }
  if (partial && body.autoApprove !== undefined) {
    if (typeof body.autoApprove !== "boolean") errors.autoApprove = "Turn auto-approve on or off.";
    else out.autoApprove = body.autoApprove;
  }
  // Owner-set daily caps (edits only); null goes back to the default.
  for (const [key, max] of [["dailyJobLimit", JOB_LIMITS.agentDailyMax], ["customerDailyLimit", JOB_LIMITS.customerDailyMax]] as const) {
    if (!partial || body[key] === undefined) continue;
    const v = body[key];
    if (v === null) out[key] = null;
    else if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max) out[key] = v;
    else errors[key] = `Use a whole number from 1 to ${max}, or leave it empty for the default.`;
  }
  // A new agent with Send webhook needs somewhere to send. (Edits check this against the saved agent in the route.)
  if (!partial && out.tools?.includes("send_webhook") && !out.webhookUrl && !errors.webhookUrl) errors.webhookUrl = "Add the webhook URL, or turn off Send webhook.";

  return Object.keys(errors).length ? { errors } : { ok: out };
}

export type ValidAgent = Fields;
