"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AFFILIATION_DISCLAIMER, FOOTER_COLUMNS } from "../../data/content";
import { ApiRequestError, api } from "../../lib/api";
import { Logo } from "./Logo";

// Only accounts that exist. Discord comes back when VORYNQ has a public server.
const SOCIALS = [
  { label: "X", href: "https://x.com/vorynqHQ", d: "M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.4 5.5-6.4zm-1.2 17.9h1.9L7.1 4.2H5.1l11.9 16z" },
  { label: "Telegram", href: "https://t.me/VorynqOfficial", d: "M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13 1.4 11.5c-1-.3-1-1 .2-1.5l18.9-7.3c.9-.3 1.6.2 1.4 1.6z" },
  { label: "GitHub", href: "https://github.com/VORYNQ/VORYNQ", d: "M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2 0 1.9 1.2 1.9 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8 0 3.2.9.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1 .9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" },
];

// Saves the email through /api/waitlist (BUILD_PLAN F1.4).
function Waitlist() {
  const [email, setEmail] = useState("");
  // Hidden from people; bots that fill every field are ignored by the server.
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setNote({ ok: false, text: "Please enter a valid email address." });
      return;
    }
    setBusy(true);
    try {
      await api.joinWaitlist(email.trim(), website);
      setNote({ ok: true, text: "You're on the list. We'll be in touch." });
      setEmail("");
    } catch (err) {
      setNote({ ok: false, text: err instanceof ApiRequestError ? err.message : "Could not join the waitlist. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-[70px] grid items-center gap-10 rounded-3xl border border-line bg-surface p-10 max-sm:p-[26px] md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-[clamp(22px,2.2vw,28px)]">Be first to launch.</h3>
        <p>Get beta access and launch updates. No spam.</p>
      </div>
      <div>
        <form onSubmit={submit} noValidate className="flex gap-2.5 max-sm:flex-col">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email"
            aria-label="Your email"
            className="h-[52px] min-w-0 flex-1 rounded-full max-sm:flex-none border border-line-strong bg-ink/60 px-[22px] text-heading placeholder:text-muted focus:border-violet-2 focus:outline-none"
          />
          <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <button type="submit" disabled={busy} className="btn btn-primary disabled:cursor-wait disabled:opacity-60">{busy ? "Joining…" : "Join the Waitlist"}</button>
        </form>
        <p role="status" className={`mt-2.5 min-h-[1em] text-sm ${note?.ok ? "text-mint" : "text-[#ff7e80]"}`}>{note?.text}</p>
        <p className="mt-1 text-xs text-muted">We only use your email to send VORYNQ launch updates.</p>
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-10 border-t border-line pt-[100px] pb-10">
      <div className="container-x">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="col-span-full lg:col-span-1">
            <Logo />
            <p className="mt-[18px] mb-7 max-w-[320px]">Where AI Agents Become Businesses.</p>
            <div className="flex gap-2.5">
              {SOCIALS.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={`VORYNQ on ${s.label}`} className="grid size-10 place-items-center rounded-full border border-line-strong text-body transition-colors hover:bg-surface-2 hover:text-heading">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="size-[17px]"><path d={s.d} /></svg>
                </a>
              ))}
            </div>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="mb-5 text-[15px] font-semibold">{col.title}</h4>
              <ul className="space-y-3">
                {col.links.map(([label, to]) => (
                  <li key={label}>
                    {to.startsWith("/") ? (
                      <Link href={to} className="text-[15px] transition-colors hover:text-heading">{label}</Link>
                    ) : (
                      <a href={to} {...(to.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="text-[15px] transition-colors hover:text-heading">{label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Waitlist />

        <div className="mt-[60px] flex flex-wrap justify-between gap-5 border-t border-line pt-7 text-sm text-muted">
          <span>© 2026 VORYNQ. All rights reserved.</span>
          <span>{AFFILIATION_DISCLAIMER}</span>
        </div>
      </div>
    </footer>
  );
}
