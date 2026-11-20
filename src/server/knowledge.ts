// Knowledge base: splits owner documents into chunks, embeds them with Workers AI (bge-m3, multilingual),
// and picks the chunks that matter for each job. Similarity is computed here: a knowledge base is at most
// 50,000 characters (about 60 chunks), so there is no need for a vector index in the database.
import "server-only";
import { cfConfigured, cfRun } from "./cloudflare";
import { knowledge } from "./db";

const EMBED_MODEL = "@cf/baai/bge-m3";
const CHUNK_CHARS = 900;
const EMBED_BATCH = 50;
/** A knowledge base this small goes to the model whole, with no search. */
export const KNOWLEDGE_INLINE_MAX = 6000;
/** Chunks sent with each job when the knowledge base is larger. */
const TOP_CHUNKS = 5;

/** Splits text into chunks of about CHUNK_CHARS, on paragraph and then sentence boundaries. */
export function chunkText(text: string): string[] {
  const pieces = text
    .split(/\n\s*\n/)
    .flatMap((p) => (p.length <= CHUNK_CHARS ? [p] : p.split(/(?<=[.!?])\s+/)))
    .flatMap((s) => (s.length <= CHUNK_CHARS ? [s] : s.match(new RegExp(`[\\s\\S]{1,${CHUNK_CHARS}}`, "g")) ?? []))
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > CHUNK_CHARS) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const { data } = await cfRun<{ data: number[][] }>(EMBED_MODEL, { text: texts.slice(i, i + EMBED_BATCH) });
    out.push(...data);
  }
  return out;
}

/** Chunks a document and embeds them. Without Cloudflare (or if it fails) the chunks are kept unembedded. */
export async function prepareChunks(title: string, content: string): Promise<{ text: string; embedding: number[] | null }[]> {
  const texts = chunkText(content);
  if (!cfConfigured()) return texts.map((text) => ({ text, embedding: null }));
  try {
    // The title helps a chunk match questions that name the document's subject.
    const vectors = await embed(texts.map((t) => `${title}\n${t}`));
    return texts.map((text, i) => ({ text, embedding: vectors[i] ?? null }));
  } catch (err) {
    console.error("[knowledge] embedding failed:", err);
    return texts.map((text) => ({ text, embedding: null }));
  }
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na * nb) || 1);
};

/**
 * The knowledge to send with a job: everything when it is small, otherwise the chunks closest to the job,
 * kept in reading order. Falls back to the first chunks when search is not possible.
 */
export async function knowledgeFor(agentId: string, input: string): Promise<{ title: string; text: string }[]> {
  const chunks = await knowledge.chunks(agentId);
  if (!chunks.length) return [];
  const total = chunks.reduce((n, c) => n + c.text.length, 0);
  const firstUpTo = (limit: number) => {
    let used = 0;
    return chunks.filter((c) => (used += c.text.length) <= limit);
  };
  if (total <= KNOWLEDGE_INLINE_MAX) return chunks;

  const searchable = chunks.filter((c) => c.embedding);
  if (!cfConfigured() || !searchable.length) return firstUpTo(KNOWLEDGE_INLINE_MAX);
  try {
    const [query] = await embed([input.slice(0, 2000)]);
    const best = new Set(
      searchable
        .map((c) => ({ c, score: cosine(query, c.embedding!) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_CHUNKS)
        .map((s) => s.c)
    );
    return chunks.filter((c) => best.has(c));
  } catch (err) {
    console.error("[knowledge] search failed:", err);
    return firstUpTo(KNOWLEDGE_INLINE_MAX);
  }
}
