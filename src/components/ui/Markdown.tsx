import { Fragment, type ReactNode } from "react";

// Agent answers are Markdown. This renders the common parts (headings, lists, tables, code, bold, italic, links)
// as React elements, so the text is always escaped: no HTML from an answer ever reaches the page.

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "code"; text: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "rule" };

const LIST_ITEM = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith("```"); i++) body.push(lines[i]);
      blocks.push({ kind: "code", text: body.join("\n") });
      i++;
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) { blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].replace(/\s+#+\s*$/, "") }); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push({ kind: "rule" }); i++; continue; }
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].includes("|") && lines[i].trim(); i++) rows.push(cells(lines[i]));
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    const item = line.match(LIST_ITEM);
    if (item) {
      const ordered = Boolean(item[1]);
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const m = lines[i].match(LIST_ITEM);
        if (m && Boolean(m[1]) === ordered) items.push(m[2]);
        else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1] += " " + lines[i].trim();
        else break;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ""));
      blocks.push({ kind: "quote", lines: quote });
      continue;
    }
    const para: string[] = [];
    for (; i < lines.length && lines[i].trim() && !LIST_ITEM.test(lines[i]) && !/^\s*(#{1,6}\s|```|>)/.test(lines[i])
      && !(lines[i].includes("|") && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])); i++) para.push(lines[i]);
    blocks.push({ kind: "paragraph", lines: para });
  }
  return blocks;
}

// `code`, **bold**, *italic*, [text](https://…). Underscores are left alone, so names like wallet_activity or __init__ stay as written.
const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = out.length;
    if (m[1] !== undefined) out.push(<code key={k} className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[0.88em]">{m[1]}</code>);
    else if (m[2] !== undefined) out.push(<strong key={k} className="font-semibold text-heading">{inline(m[2])}</strong>);
    else if (m[3] !== undefined) out.push(<em key={k}>{inline(m[3])}</em>);
    else out.push(<a key={k} href={m[5]} target="_blank" rel="noopener noreferrer nofollow" className="text-violet-2 underline">{m[4]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const withBreaks = (lines: string[]) => lines.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l)}</Fragment>);

const HEADING_SIZE = ["text-[1.25em]", "text-[1.15em]", "text-[1.05em]", "text-[1em]", "text-[1em]", "text-[1em]"];

/** Renders an agent's Markdown answer. Size and colour come from `className`. */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`space-y-3 break-words ${className}`}>
      {parse(text).map((b, i) => {
        switch (b.kind) {
          case "heading":
            return <p key={i} role="heading" aria-level={Math.min(b.level + 2, 6)} className={`font-semibold text-heading ${HEADING_SIZE[b.level - 1]}`}>{inline(b.text)}</p>;
          case "paragraph":
            return <p key={i}>{withBreaks(b.lines)}</p>;
          case "list": {
            const List = b.ordered ? "ol" : "ul";
            return <List key={i} className={`space-y-1 pl-5 ${b.ordered ? "list-decimal" : "list-disc"} marker:text-muted`}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</List>;
          }
          case "quote":
            return <blockquote key={i} className="border-l-2 border-line-strong pl-3 text-muted">{withBreaks(b.lines)}</blockquote>;
          case "code":
            return <pre key={i} className="overflow-x-auto rounded-lg border border-line bg-surface p-3 font-mono text-[0.85em] whitespace-pre">{b.text}</pre>;
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-[0.92em]">
                  <thead className="bg-surface"><tr>{b.head.map((h, j) => <th key={j} className="px-3 py-2 font-semibold text-heading">{inline(h)}</th>)}</tr></thead>
                  <tbody>{b.rows.map((r, j) => <tr key={j} className="border-t border-line align-top">{b.head.map((_, k) => <td key={k} className="px-3 py-2">{inline(r[k] ?? "")}</td>)}</tr>)}</tbody>
                </table>
              </div>
            );
          case "rule":
            return <hr key={i} className="border-line" />;
        }
      })}
    </div>
  );
}

/** The answer as plain text, without Markdown marks, for short previews. */
export const plainText = (markdown: string) =>
  markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*\|?\s*:?-{2,}[-|:\s]*$/gm, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s*\|\s*/g, " · ")
    .replace(/\s+/g, " ")
    .trim();
