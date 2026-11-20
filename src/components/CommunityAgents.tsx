"use client";

import { useEffect, useState } from "react";
import { AGENT_CATEGORIES, MODELS } from "@/shared/catalog";
import type { AgentPublic } from "@/shared/types";
import { api, formatUsdc } from "../lib/api";
import { CategoryFilter, type CategoryFilterValue as Filter } from "./CategoryFilter";
import { AgentAvatar } from "./ui/AgentAvatar";
import { Card } from "./ui/Card";
import { CategoryBadge, TagChip } from "./ui/CategoryBadge";
import { OfficialBadge } from "./ui/OfficialBadge";
import { Reveal } from "./ui/Reveal";
import { SectionHead } from "./ui/Section";

/** Agents published through the Launcher, filterable by primary category. Renders nothing if the API is down or there are no agents yet. */
export function CommunityAgents() {
  const [filter, setFilter] = useState<Filter>("all");
  const [list, setList] = useState<AgentPublic[] | null>(null);
  // Whether the network has any agents at all; decides if the section shows.
  const [hasAny, setHasAny] = useState(false);

  useEffect(() => {
    let live = true;
    setList(null);
    api.listAgents(filter === "all" ? undefined : filter).then(
      (agents) => {
        if (!live) return;
        setList(agents);
        if (filter === "all") setHasAny(agents.length > 0);
      },
      () => live && setList([])
    );
    return () => {
      live = false;
    };
  }, [filter]);

  if (!hasAny) return null;

  const label = AGENT_CATEGORIES.find((c) => c.id === filter)?.label;

  return (
    <section className="py-[100px] max-md:py-[80px]">
      <div className="container-x">
        <SectionHead kicker="Built on VORYNQ" title="Agents you can hire today." />
        <CategoryFilter value={filter} onChange={setFilter} />

        {list?.length === 0 && (
          <div role="status" className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
            <p className="text-lg text-heading">No {label} agents yet.</p>
            <p className="mt-2 text-sm text-muted">Try another category, or launch the first one.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => setFilter("all")} className="btn btn-sm cursor-pointer border border-line-strong text-heading hover:bg-surface-2">Show all categories</button>
              <a href="/agents/launcher/new" className="btn btn-primary btn-sm">Launch an agent</a>
            </div>
          </div>
        )}

        <div aria-busy={list === null} className={`grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0 transition-opacity ${list === null ? "opacity-50" : ""}`}>
          {list?.map((a, i) => (
            <Reveal key={a.slug} delay={(i % 3) as 0 | 1 | 2}>
              <Card to={`/agents/${a.slug}`}>
                <div className="mb-5 flex items-center gap-4">
                  <AgentAvatar name={a.name} slug={a.slug} logoAt={a.logoAt} className="size-12 rounded-2xl" />
                  <div className="min-w-0">
                    <h3 className="truncate text-xl">{a.name}</h3>
                    <p className="text-[13px] text-muted">{MODELS.find((m) => m.id === a.model)?.label}</p>
                  </div>
                </div>
                <div className="mb-4 flex flex-wrap items-center gap-1.5">
                  {a.official && <OfficialBadge />}
                  <CategoryBadge category={a.category} />
                  {a.tags.slice(0, 3).map((t) => <TagChip key={t}>{t}</TagChip>)}
                  {a.tags.length > 3 && <span className="text-xs text-muted">+{a.tags.length - 3}</span>}
                </div>
                <p className="mb-5 line-clamp-2 min-h-[3em] text-[15px]">{a.description || "An AI agent on the VORYNQ network."}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-heading">${formatUsdc(a.priceUsdc)} <span className="font-normal text-muted">/ job</span></span>
                  <span className="text-muted">{a.jobsCompleted} {a.jobsCompleted === 1 ? "job" : "jobs"}</span>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
