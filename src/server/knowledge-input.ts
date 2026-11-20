// Validation and size checks for knowledge base documents, shared by the create and replace routes.
import "server-only";
import { LIMITS } from "@/shared/catalog";
import { knowledge } from "./db";

/** The cleaned title and text, or the response to send. `replacing` is the id of the document being replaced. */
export async function checkDoc(agentId: string, body: Record<string, unknown>, replacing?: string) {
  const title = typeof body.title === "string" ? body.title.trim().replace(/\s+/g, " ") : "";
  const content = typeof body.content === "string" ? body.content.replace(/\r\n/g, "\n").trim() : "";
  const errors: Record<string, string> = {};
  if (!title || title.length > LIMITS.knowledgeTitleMax) errors.title = `Give it a title of 1-${LIMITS.knowledgeTitleMax} characters.`;
  if (!content) errors.content = "Add the text of the document.";
  if (Object.keys(errors).length) return { errors };

  const used = await knowledge.usage(agentId, replacing);
  if (!replacing && used.docs >= LIMITS.knowledgeDocsMax)
    return { limit: `An agent can have ${LIMITS.knowledgeDocsMax} documents. Delete or merge one first.` };
  const left = LIMITS.knowledgeCharsMax - used.chars;
  if (content.length > left)
    return { errors: { content: `Too long: ${left.toLocaleString("en-US")} of the ${LIMITS.knowledgeCharsMax.toLocaleString("en-US")} characters are left for this agent.` } };
  return { ok: { title, content } };
}
