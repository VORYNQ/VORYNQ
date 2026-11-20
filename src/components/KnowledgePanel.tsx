"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { LIMITS } from "@/shared/catalog";
import type { KnowledgeDoc } from "@/shared/types";
import { ApiRequestError, api } from "../lib/api";
import { Icon } from "./ui/Icon";

const message = (err: unknown) => (err instanceof ApiRequestError ? Object.values(err.fields ?? {})[0] ?? err.message : "Something went wrong. Please try again.");
const field = "w-full rounded-xl border border-line-strong bg-ink/60 px-3 text-sm text-heading placeholder:text-muted focus:border-violet-2 focus:outline-none";
const fmt = (n: number) => n.toLocaleString("en-US");

/** Owner-only: documents the agent consults with every job (the parts that match the job, when there is a lot). */
export function KnowledgePanel({ slug }: { slug: string }) {
  const [docs, setDocs] = useState<KnowledgeDoc[] | null>(null);
  const [used, setUsed] = useState(0);
  // "new" while adding; a document id while editing it.
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => api.listKnowledge(slug).then((r) => { setDocs(r.docs); setUsed(r.usedChars); }, (err) => setError(message(err)));
  useEffect(() => { void reload(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  }

  const open = (doc: KnowledgeDoc | null) =>
    run(doc ? `open-${doc.id}` : "open", async () => {
      const full = doc ? await api.getKnowledge(slug, doc.id) : { title: "", content: "" };
      setTitle(full.title);
      setContent(full.content);
      setEditing(doc ? doc.id : "new");
    });

  const save = (e: FormEvent) => {
    e.preventDefault();
    run("save", async () => {
      await api.saveKnowledge(slug, { id: editing === "new" ? undefined : editing ?? undefined, title, content });
      setEditing(null);
      await reload();
    });
  };

  const remove = (doc: KnowledgeDoc) =>
    run(doc.id, async () => {
      if (!window.confirm(`Delete "${doc.title}"? The agent stops using it from the next job.`)) return;
      await api.deleteKnowledge(slug, doc.id);
      await reload();
    });

  // Reads a .txt or .md file into the editor; the title defaults to the file name.
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    setContent((c) => (c.trim() ? `${c}\n\n${text}` : text));
    setTitle((t) => t || file.name.replace(/\.(txt|md|markdown|csv)$/i, "").slice(0, LIMITS.knowledgeTitleMax));
  }

  // Room left for the document being edited: its own old size is given back.
  const editingChars = editing && editing !== "new" ? docs?.find((d) => d.id === editing)?.chars ?? 0 : 0;
  const room = LIMITS.knowledgeCharsMax - used + editingChars;
  const full = (docs?.length ?? 0) >= LIMITS.knowledgeDocsMax || used >= LIMITS.knowledgeCharsMax;

  return (
    <section aria-labelledby="knowledge-heading" className="rounded-2xl border border-line bg-surface p-7">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 id="knowledge-heading" className="text-xl">Knowledge base</h2>
        {docs && <span className="text-xs text-muted tabular-nums">{fmt(used)} / {fmt(LIMITS.knowledgeCharsMax)} characters</span>}
      </div>
      <p className="mb-2 text-[13px] text-muted">
        Facts, product details, policies or data the agent should know. With each job it reads the parts that match the job
        (everything, while the knowledge base is small). Only you can edit it.
      </p>
      <p className="mb-5 flex gap-2 text-[13px] text-amber">
        <Icon name="alert" className="mt-0.5 size-3.5 flex-none" />
        Customers may see anything in here through the agent&apos;s answers. Never add passwords, keys or private data.
      </p>

      {docs && used > 0 && (
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className="bg-grad h-full" style={{ width: `${Math.min(100, (used / LIMITS.knowledgeCharsMax) * 100)}%` }} />
        </div>
      )}

      {editing ? (
        <form onSubmit={save} className="space-y-3 rounded-xl border border-violet-2/35 bg-violet-2/6 p-4">
          <label className="block text-sm font-medium text-heading">Title
            <input value={title} maxLength={LIMITS.knowledgeTitleMax} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Supported protocols and fees" className={`${field} mt-1.5 h-10`} />
          </label>
          <label className="block text-sm font-medium text-heading">Text
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={12} placeholder="Paste the document text here, or load a .txt / .md file below."
              className={`${field} mt-1.5 resize-y py-2 leading-relaxed`} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <label className="cursor-pointer text-violet-2 hover:underline">
              <input type="file" accept=".txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv" onChange={upload} className="sr-only" />
              Load a text file
            </label>
            <span className={`tabular-nums ${content.length > room ? "text-[#ff7e80]" : ""}`}>{fmt(content.length)} / {fmt(Math.max(0, room))} characters left</span>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy !== null || !title.trim() || !content.trim() || content.length > room} className="btn btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-50">
              {busy === "save" ? "Saving and indexing…" : editing === "new" ? "Add document" : "Save changes"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="btn btn-ghost btn-sm">Cancel</button>
          </div>
        </form>
      ) : (
        <ul className="space-y-2">
          {docs === null && !error && <li className="text-sm text-muted">Loading knowledge base…</li>}
          {docs?.length === 0 && <li className="text-sm text-muted">No documents yet.</li>}
          {docs?.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line px-4 py-3">
              <span className="min-w-0 flex-[1_1_200px]">
                <span className="block truncate text-sm font-medium text-heading">{d.title}</span>
                <span className="text-xs text-muted">
                  {fmt(d.chars)} characters · {d.chunks} {d.chunks === 1 ? "part" : "parts"}
                  {!d.searchable && <span className="text-amber"> · not indexed for search, save it again to retry</span>}
                </span>
              </span>
              <span className="ml-auto flex gap-4 text-[13px]">
                <button type="button" disabled={busy !== null} onClick={() => open(d)} className="cursor-pointer text-violet-2 hover:underline disabled:cursor-wait">{busy === `open-${d.id}` ? "Opening…" : "Edit"}</button>
                <button type="button" disabled={busy !== null} onClick={() => remove(d)} className="cursor-pointer text-magenta hover:underline disabled:cursor-wait">{busy === d.id ? "Deleting…" : "Delete"}</button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-[#ff7e80]">{error}</p>}
      {!editing && docs && (
        <button type="button" disabled={full || busy !== null} onClick={() => open(null)} className="btn btn-ghost btn-sm mt-4 disabled:cursor-not-allowed disabled:opacity-50"
          title={full ? "The knowledge base is full. Delete or shorten a document first." : undefined}>
          <Icon name="plus" className="size-4" /> Add document
        </button>
      )}
    </section>
  );
}
