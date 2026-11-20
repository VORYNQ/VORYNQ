"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LIMITS } from "@/shared/catalog";
import type { AgentExample } from "@/shared/types";
import { ApiRequestError, api } from "../lib/api";
import { Icon } from "./ui/Icon";
import { plainText } from "./ui/Markdown";

const message = (err: unknown) => (err instanceof ApiRequestError ? Object.values(err.fields ?? {})[0] ?? err.message : "Something went wrong. Please try again.");
const area = "w-full resize-y rounded-xl border border-line-strong bg-ink/60 px-3 py-2 text-sm leading-relaxed text-heading placeholder:text-muted focus:border-violet-2 focus:outline-none";

/** The job + ideal answer fields, shared by adding, editing and "Save as example" on the Requests page. */
export function ExampleFields({ input, output, onInput, onOutput, idPrefix }: { input: string; output: string; onInput: (v: string) => void; onOutput: (v: string) => void; idPrefix: string }) {
  return (
    <>
      <label htmlFor={`${idPrefix}-in`} className="block text-sm font-medium text-heading">Example job</label>
      <textarea id={`${idPrefix}-in`} value={input} maxLength={LIMITS.exampleInputMax} rows={3} onChange={(e) => onInput(e.target.value)}
        placeholder="What a customer might ask, e.g. Explain the risks of stablecoin lending on Aave" className={`${area} mt-1.5`} />
      <label htmlFor={`${idPrefix}-out`} className="mt-3 block text-sm font-medium text-heading">Ideal answer</label>
      <textarea id={`${idPrefix}-out`} value={output} maxLength={LIMITS.exampleOutputMax} rows={6} onChange={(e) => onOutput(e.target.value)}
        placeholder="The answer you want, in the style, length and format the agent should copy" className={`${area} mt-1.5`} />
    </>
  );
}

/** Owner-only: example jobs with ideal answers. The agent sees all of them with every job and copies their style. */
export function ExamplesPanel({ slug }: { slug: string }) {
  const [list, setList] = useState<AgentExample[] | null>(null);
  // "new" while adding; an example id while editing it.
  const [editing, setEditing] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listExamples(slug).then(setList, (err) => setError(message(err)));
  }, [slug]);

  const open = (e: AgentExample | null) => {
    setEditing(e ? e.id : "new");
    setInput(e?.input ?? "");
    setOutput(e?.output ?? "");
    setError(null);
  };

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

  const save = (e: FormEvent) => {
    e.preventDefault();
    run("save", async () => {
      if (editing === "new") {
        const added = await api.addExample(slug, { input, output });
        setList((l) => [...(l ?? []), added]);
      } else if (editing) {
        const updated = await api.updateExample(slug, editing, { input, output });
        setList((l) => l?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
      }
      setEditing(null);
    });
  };

  const remove = (ex: AgentExample) =>
    run(ex.id, async () => {
      if (!window.confirm("Delete this example? The agent stops using it from the next job.")) return;
      await api.deleteExample(slug, ex.id);
      setList((l) => l?.filter((x) => x.id !== ex.id) ?? null);
    });

  const full = (list?.length ?? 0) >= LIMITS.examplesMax;
  const form = (
    <form onSubmit={save} className="rounded-xl border border-violet-2/35 bg-violet-2/6 p-4">
      <ExampleFields idPrefix={`ex-${editing}`} input={input} output={output} onInput={setInput} onOutput={setOutput} />
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy !== null || !input.trim() || !output.trim()} className="btn btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-50">
          {busy === "save" ? "Saving…" : editing === "new" ? "Add example" : "Save changes"}
        </button>
        <button type="button" onClick={() => setEditing(null)} className="btn btn-ghost btn-sm">Cancel</button>
      </div>
    </form>
  );

  return (
    <section aria-labelledby="examples-heading" className="rounded-2xl border border-line bg-surface p-7">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 id="examples-heading" className="text-xl">Training examples</h2>
        {list && <span className="text-xs text-muted tabular-nums">{list.length}/{LIMITS.examplesMax}</span>}
      </div>
      <p className="mb-5 text-[13px] text-muted">
        Show the agent what a great answer looks like. It reads every example with each job and copies their style, depth and format.
        A few good examples usually beat long instructions. Only you see them; you can also save one from a real job on the Requests page.
      </p>

      <ul className="space-y-3">
        {list === null && !error && <li className="text-sm text-muted">Loading examples…</li>}
        {list?.length === 0 && editing !== "new" && <li className="text-sm text-muted">No examples yet.</li>}
        {list?.map((ex) =>
          editing === ex.id ? (
            <li key={ex.id}>{form}</li>
          ) : (
            <li key={ex.id} className="rounded-xl border border-line px-4 py-3">
              <p className="line-clamp-2 text-sm text-heading"><span className="font-semibold">Job:</span> {ex.input}</p>
              <p className="mt-1 line-clamp-3 text-sm text-body"><span className="font-semibold text-heading">Ideal answer:</span> {plainText(ex.output)}</p>
              <div className="mt-2 flex items-center gap-4 text-[13px]">
                {ex.sourceJobId && <span className="text-xs text-muted">From a real job</span>}
                <button type="button" disabled={busy !== null || editing !== null} onClick={() => open(ex)} className="ml-auto cursor-pointer text-violet-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50">Edit</button>
                <button type="button" disabled={busy !== null} onClick={() => remove(ex)} className="cursor-pointer text-magenta hover:underline disabled:cursor-wait">{busy === ex.id ? "Deleting…" : "Delete"}</button>
              </div>
            </li>
          )
        )}
        {editing === "new" && <li>{form}</li>}
      </ul>

      {error && <p role="alert" className="mt-3 text-sm text-[#ff7e80]">{error}</p>}
      {editing === null && list && (
        <button type="button" disabled={full} onClick={() => open(null)} className="btn btn-ghost btn-sm mt-4 disabled:cursor-not-allowed disabled:opacity-50"
          title={full ? `Up to ${LIMITS.examplesMax} examples. Delete one to add another.` : undefined}>
          <Icon name="plus" className="size-4" /> Add example
        </button>
      )}
    </section>
  );
}
