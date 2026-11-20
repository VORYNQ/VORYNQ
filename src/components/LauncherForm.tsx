"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_MODEL, LAUNCHER_TOOLS, LIMITS, MODELS, NAME_TAKEN, TOOLS, categoryInfo, normalizeName, type AgentCategoryId, type ModelId, type ToolId } from "@/shared/catalog";
import { ApiRequestError, api, formatUsdc } from "../lib/api";
import { shortAddress } from "../shared/address";
import { useAuth } from "../lib/auth";
import { CategoryPicker } from "./CategoryPicker";
import { ConnectWallet } from "./layout/ConnectWallet";
import { TagInput } from "./TagInput";
import { AgentAvatar } from "./ui/AgentAvatar";
import { CategoryBadge, TagChip } from "./ui/CategoryBadge";
import { Icon } from "./ui/Icon";

const field = "w-full rounded-xl border border-line-strong bg-ink/60 px-4 text-heading placeholder:text-muted focus:border-violet-2 focus:outline-none";
const label = "mb-1.5 block text-sm font-medium text-heading";
const hint = "mt-1.5 text-[13px] text-muted";
const chip = (on: boolean) =>
  `inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${
    on ? "border-violet-2/70 bg-violet-2/15 text-heading" : "border-line text-body hover:border-line-strong hover:text-heading"
  }`;

const STEPS = ["Basics", "Instructions", "Price & publish"] as const;
/** Which step holds each field, so a server error can send the creator back to it. */
const FIELD_STEP: Record<string, number> = { name: 0, category: 0, description: 0, instructions: 1, priceUsdc: 2, tools: 2, tags: 2, model: 2, webhookUrl: 2 };

// Tools switched on automatically for each category, until the creator changes them by hand.
const RECOMMENDED_TOOLS: Record<AgentCategoryId, ToolId[]> = {
  research: ["read_webpage", "crypto_price", "current_time"],
  trading: ["crypto_price", "wallet_overview", "token_info", "calculator", "current_time"],
  automation: ["send_webhook", "read_webpage", "current_time"],
  analytics: ["analyze_table", "calculator"],
};

const PRICE_PRESETS = ["0.10", "0.50", "1.00", "2.00"];

// Filled into an empty instructions box, so creators see the shape of good instructions.
const INSTRUCTIONS_OUTLINE =
  "You are a … (who the agent is and who it helps).\n\nFor each job:\n1. …\n2. …\n3. …\n\nAnswer format: … (e.g. a short summary, then a table).\nNever: … (e.g. give financial advice).";

// One-click starting points; creators are expected to edit them.
type Template = { label: string; name: string; description: string; category: AgentCategoryId; tags: string[]; instructions: string; tools: ToolId[] };

const TEMPLATES: Template[] = [
  {
    label: "Token research brief",
    name: "Token Brief",
    description: "One-page research briefs on any crypto token.",
    category: "research",
    tags: ["Token research", "Market data"],
    instructions:
      "You write concise research briefs on crypto tokens.\n\nEach brief covers: what the project does, current price and 24h change, token supply and utility, recent news, and the key risks. Cite the sources you used. Keep it under 400 words and clearly label anything you could not verify. Do not give investment advice.",
    tools: ["crypto_price", "current_time"],
  },
  {
    label: "DeFi yield explainer",
    name: "Yield Explainer",
    description: "Plain-English breakdowns of DeFi yields and their risks.",
    category: "research",
    tags: ["DeFi", "Yield", "Risk analysis"],
    instructions:
      "You explain DeFi lending and liquidity-pool yields to retail users.\n\nFor each job:\n1. Identify the protocol, asset and yield the customer asks about.\n2. Look up current information and token prices with your tools.\n3. Explain where the yield comes from, the main risks (smart contract, liquidation, depeg, impermanent loss) and what could change it.\n\nEnd with a short summary table. Never tell the customer to buy, sell or deposit: you provide research, not financial advice.",
    tools: ["crypto_price", "calculator"],
  },
  {
    label: "Market snapshot",
    name: "Market Snapshot",
    description: "A quick read on price moves for the tokens you name.",
    category: "trading",
    tags: ["Market signals", "Price action"],
    instructions:
      "You give a short market snapshot for the tokens the customer names.\n\nFor each job:\n1. Fetch the current price and 24h change of every token.\n2. Work out the moves exactly with the calculator.\n3. Summarise what stands out (biggest movers, notable swings) in plain language.\n\nAnswer with a table, then three bullet points. Analysis only: never tell the customer to buy or sell, and never place trades.",
    tools: ["crypto_price", "calculator", "current_time"],
  },
  {
    label: "Numbers to insights",
    name: "Data Insights",
    description: "Turns the numbers you paste into a clear short report.",
    category: "analytics",
    tags: ["Data analytics", "Reports"],
    instructions:
      "You turn numbers the customer pastes (a table, a list or a CSV) into a short report.\n\nFor each job:\n1. Check what the data contains and say if anything looks missing or odd.\n2. Calculate totals, averages, the largest and smallest values and changes over time, using the calculator for every figure.\n3. Explain the three most useful findings in plain language.\n\nAnswer with a summary table followed by the findings. Never invent numbers that are not in the data.",
    tools: ["calculator"],
  },
];

/** Agent setup as a three-step wizard (Basics, Instructions, Price & publish) that fits on one screen.
 *  Posts to the API and opens the new agent's page. */
export function LauncherForm() {
  const router = useRouter();
  const auth = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<AgentCategoryId | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [tools, setTools] = useState<ToolId[]>(["calculator"]);
  const [toolsTouched, setToolsTouched] = useState(false);
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [price, setPrice] = useState("0.50");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Set by the live check below; publishing checks the name again on the server.
  const [nameTaken, setNameTaken] = useState(false);

  const clearFieldError = (key: string) => setFieldErrors(({ [key]: _gone, ...rest }) => rest);

  // Checks the name a moment after typing stops, so a taken name shows before Next.
  useEffect(() => {
    const n = normalizeName(name);
    setNameTaken(false);
    if (n.length < LIMITS.nameMin) return;
    let live = true;
    const timer = setTimeout(() => {
      api.nameAvailable(n).then(
        (available) => {
          if (!live || available) return;
          setNameTaken(true);
          setFieldErrors((f) => ({ ...f, name: NAME_TAKEN }));
        },
        () => {}
      );
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [name]);

  const pickCategory = (c: AgentCategoryId) => {
    setCategory(c);
    if (!toolsTouched) setTools(RECOMMENDED_TOOLS[c]);
    clearFieldError("category");
  };
  const toggleTool = (id: ToolId) => {
    setToolsTouched(true);
    setTools((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]));
  };
  const applyTemplate = (t: Template) => {
    setName(t.name);
    setDescription(t.description);
    setCategory(t.category);
    setTags(t.tags);
    setInstructions(t.instructions);
    setTools(t.tools);
    setToolsTouched(false);
    setFieldErrors({});
    setError(null);
  };

  const priceNum = Number(price);
  const priceOk = price.trim() !== "" && Number.isFinite(priceNum) && priceNum >= 0;
  const slugPreview = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "your-agent";
  const modelInfo = MODELS.find((m) => m.id === model)!;
  const recommended = category ? RECOMMENDED_TOOLS[category] : [];

  /** Checks the fields of one step before moving on (the server checks everything again). */
  function stepErrors(s: number): Record<string, string> {
    const errs: Record<string, string> = {};
    if (s === 0) {
      const n = name.trim().length;
      if (n < LIMITS.nameMin || n > LIMITS.nameMax) errs.name = `Use ${LIMITS.nameMin}-${LIMITS.nameMax} characters.`;
      else if (nameTaken) errs.name = NAME_TAKEN;
      if (!category) errs.category = "Pick what your agent does.";
    }
    if (s === 1 && instructions.trim().length < LIMITS.instructionsMin) errs.instructions = `Write at least ${LIMITS.instructionsMin} characters.`;
    if (s === 2 && !priceOk) errs.priceUsdc = "Enter a price per job. Use 0 to make it free.";
    return errs;
  }

  function goTo(target: number) {
    setError(null);
    // Moving forward checks every step in between; going back is always allowed.
    for (let s = step; s < target; s++) {
      const errs = stepErrors(s);
      if (Object.keys(errs).length) {
        setFieldErrors(errs);
        setStep(s);
        return;
      }
    }
    setFieldErrors({});
    setStep(target);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Enter in a field on steps 1-2 means "Next", not "Publish".
    if (step < STEPS.length - 1) return goTo(step + 1);
    setError(null);
    const errs = stepErrors(step);
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    try {
      const { agent } = await api.createAgent({
        name,
        description,
        category: category!,
        tags,
        instructions,
        tools,
        model,
        priceUsdc: Math.round(priceNum * 100) / 100,
        webhookUrl: tools.includes("send_webhook") ? webhookUrl : null,
      });
      router.push(`/agents/${agent.slug}?created=1`);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        setFieldErrors(err.fields ?? {});
        // Show the earliest step with a problem.
        const steps = Object.keys(err.fields ?? {}).map((k) => FIELD_STEP[k] ?? 2);
        if (steps.length) setStep(Math.min(...steps));
      } else {
        setError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  }

  const fieldError = (key: string) => fieldErrors[key] && <p id={`lf-${key}-error`} className="mt-1.5 text-[13px] text-[#ff7e80]">{fieldErrors[key]}</p>;
  const last = step === STEPS.length - 1;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
      <form onSubmit={submit} noValidate aria-label="Create an agent" className="glass-card flex flex-col p-0! hover:translate-y-0">
        {/* Step indicator; finished steps can be revisited. */}
        <ol className="flex items-center gap-2 border-b border-line px-5 py-3.5 sm:px-6">
          {STEPS.map((s, i) => (
            <li key={s} className="flex min-w-0 items-center gap-2">
              {i > 0 && <span aria-hidden="true" className="h-px w-4 flex-none bg-line-strong sm:w-8" />}
              <button type="button" onClick={() => i < step && goTo(i)} disabled={i > step} aria-current={i === step ? "step" : undefined}
                className={`flex min-w-0 items-center gap-2 text-sm ${i < step ? "cursor-pointer" : "cursor-default"} ${i === step ? "font-semibold text-heading" : "text-muted"}`}>
                <span className={`grid size-6 flex-none place-items-center rounded-full text-xs font-bold ${i <= step ? "bg-grad text-white" : "border border-line-strong"}`}>
                  {i < step ? <Icon name="check" className="size-3.5" /> : i + 1}
                </span>
                <span className={`truncate ${i === step ? "" : "max-sm:hidden"}`}>{s}</span>
              </button>
            </li>
          ))}
        </ol>

        {/* Step body: fixed height on desktop so the card never grows past the screen. */}
        <div className="px-5 py-5 sm:px-6 lg:h-[372px] lg:overflow-y-auto">
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="lf-template" className="flex items-center gap-1.5 text-sm text-muted"><Icon name="spark" className="size-4 text-violet-2" />Quick start:</label>
                <select id="lf-template" value="" onChange={(e) => { const t = TEMPLATES.find((x) => x.label === e.target.value); if (t) applyTemplate(t); }}
                  className="h-9 cursor-pointer rounded-full border border-line bg-ink/60 px-3 text-sm text-heading focus:border-violet-2 focus:outline-none">
                  <option value="">Use a ready-made agent…</option>
                  {TEMPLATES.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="lf-name" className={label}>Agent name</label>
                <input id="lf-name" className={`${field} h-11`} value={name} maxLength={LIMITS.nameMax} autoFocus
                  onChange={(e) => { setName(e.target.value); clearFieldError("name"); }} placeholder="e.g. Yield Explainer" />
                {fieldError("name")}
              </div>

              <fieldset id="lf-category" aria-describedby={fieldErrors.category ? "lf-category-error" : undefined}>
                <legend className={label}>What does it do?</legend>
                <CategoryPicker value={category} onChange={pickCategory} disabled={submitting} />
                {fieldErrors.category ? fieldError("category") : <p className={`${hint} line-clamp-1`}>{category ? categoryInfo(category).description : "Pick the one that best describes its main job."}</p>}
              </fieldset>

              <div>
                <label htmlFor="lf-desc" className={label}>One-line description <span className="font-normal text-muted">(optional)</span></label>
                <input id="lf-desc" className={`${field} h-11`} value={description} maxLength={LIMITS.descriptionMax} onChange={(e) => setDescription(e.target.value)} placeholder="Shown to customers on your agent's page" />
                {fieldError("description")}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex h-full flex-col">
              <div className="mb-1.5 flex items-end justify-between gap-3">
                <label htmlFor="lf-instr" className="block text-sm font-medium text-heading">How should it work?</label>
                {!instructions.trim() && (
                  <button type="button" onClick={() => setInstructions(INSTRUCTIONS_OUTLINE)} className="cursor-pointer text-[13px] font-medium text-violet-2 hover:text-heading">
                    Use an outline
                  </button>
                )}
              </div>
              <textarea id="lf-instr" className={`${field} min-h-[220px] flex-1 resize-none py-3 leading-relaxed`} value={instructions} maxLength={LIMITS.instructionsMax} autoFocus
                onChange={(e) => { setInstructions(e.target.value); clearFieldError("instructions"); }}
                placeholder="Write it like a brief for a new assistant: who they are, the steps for each job, and what a great answer looks like." />
              <div className="flex justify-between gap-4">
                {fieldErrors.instructions ? fieldError("instructions") : <p className={hint}>Kept private: customers only see the results.</p>}
                <p className={`${hint} tabular-nums`}>{instructions.length}/{LIMITS.instructionsMax}</p>
              </div>
            </div>
          )}

          {last && (
            <div className="space-y-4">
              <div>
                <label htmlFor="lf-price" className={label}>Price per job (in stablecoins) <span className="font-normal text-muted">· test mode, nothing is charged yet</span></label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-[120px]">
                    <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
                    <input id="lf-price" type="number" min="0" max={LIMITS.priceMax} step="0.01" inputMode="decimal" className={`${field} h-10 pl-8`}
                      value={price} onChange={(e) => { setPrice(e.target.value); clearFieldError("priceUsdc"); }} />
                  </div>
                  {PRICE_PRESETS.map((p) => {
                    const on = priceOk && formatUsdc(priceNum) === p;
                    return <button key={p} type="button" onClick={() => setPrice(p)} aria-pressed={on} className={chip(on)}>${p}</button>;
                  })}
                </div>
                {fieldError("priceUsdc")}
              </div>

              <fieldset>
                <legend className={label}>Tools <span className="font-normal text-muted">({toolsTouched || !category ? "what it can use" : "set for your category"})</span></legend>
                <div className="flex flex-wrap gap-2">
                  {LAUNCHER_TOOLS.map((t) => {
                    const on = tools.includes(t.id);
                    return (
                      <label key={t.id} title={t.description} className={`${chip(on)} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-violet-2`}>
                        <input type="checkbox" checked={on} onChange={() => toggleTool(t.id)} className="sr-only" />
                        {on && <Icon name="check" className="size-3.5 text-violet-2" />}
                        {t.label}
                        {recommended.includes(t.id) && !on && <span className="text-[11px] font-semibold text-mint">Recommended</span>}
                      </label>
                    );
                  })}
                </div>
                {fieldError("tools")}
                {tools.includes("send_webhook") && (
                  <div className="mt-3">
                    <label htmlFor="lf-webhook" className={label}>Webhook URL <span className="font-normal text-muted">(private, only you see it)</span></label>
                    <input id="lf-webhook" type="url" inputMode="url" className={`${field} h-11 font-mono text-sm`} value={webhookUrl} maxLength={LIMITS.webhookUrlMax}
                      onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.example.com/…" aria-describedby={fieldErrors.webhookUrl ? "lf-webhookUrl-error" : undefined} />
                    {fieldError("webhookUrl")}
                  </div>
                )}
              </fieldset>

              <fieldset>
                <legend className={label}>AI model <span className="font-normal text-muted">· {model === DEFAULT_MODEL ? "fast, good for most jobs" : "slower, better for analysis"}</span></legend>
                <div className="flex flex-wrap gap-2">
                  {MODELS.map((m) => (
                    <label key={m.id} title={m.note} className={`${chip(model === m.id)} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-violet-2`}>
                      <input type="radio" name="model" value={m.id} checked={model === m.id} onChange={() => setModel(m.id)} className="sr-only" />
                      {m.label}
                    </label>
                  ))}
                </div>
                {fieldError("model")}
              </fieldset>

              <div>
                <label htmlFor="lf-tags" className={label}>Tags <span className="font-normal text-muted">(optional, helps people find it)</span></label>
                <TagInput id="lf-tags" value={tags} onChange={setTags} placeholder="e.g. Solana, Wallet tracking" />
                {fieldError("tags")}
              </div>
            </div>
          )}
        </div>

        {/* Footer: errors, Back and Next / Publish. */}
        <div className="border-t border-line px-5 py-3.5 sm:px-6">
          {error && <p role="alert" className="mb-3 text-sm text-[#ff7e80]">{error}</p>}
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button type="button" onClick={() => goTo(step - 1)} disabled={submitting} className="btn btn-ghost btn-sm">Back</button>
            )}
            <span className="ml-auto text-[13px] text-muted max-sm:hidden">
              {last && auth.address ? <>Publishing as <span className="font-mono text-heading">{shortAddress(auth.address)}</span></> : `Step ${step + 1} of ${STEPS.length}`}
            </span>
            {!last ? (
              <button type="submit" className="btn btn-primary btn-sm max-sm:ml-auto">Next</button>
            ) : auth.address ? (
              <button type="submit" disabled={submitting} className="btn btn-primary btn-sm max-sm:ml-auto disabled:cursor-wait disabled:opacity-60">
                {submitting ? "Publishing…" : "Publish agent"}
              </button>
            ) : (
              <ConnectWallet className="max-sm:ml-auto" label="Connect wallet to publish" />
            )}
          </div>
        </div>
      </form>

      {/* Live preview of the agent's page */}
      <aside aria-label="Agent page preview" className="rounded-2xl border border-violet-2/35 bg-ink-2 p-6 shadow-[0_30px_80px_-30px_rgb(178_60_255/0.45)] max-lg:hidden">
        <div className="mb-5 flex items-center justify-between gap-3">
          <span className="font-mono text-xs tracking-[0.1em] text-muted uppercase">Live preview</span>
          <span className="rounded-full border border-amber/35 bg-amber/8 px-3 py-1 text-xs font-semibold text-amber">Draft</span>
        </div>
        <div className="flex items-center gap-4">
          <AgentAvatar name={name} className="size-14 rounded-2xl text-lg" />
          <div className="min-w-0">
            <h3 className="truncate text-[22px]">{name.trim() || "Untitled agent"}</h3>
            {category ? <CategoryBadge category={category} className="mt-1" /> : <p className="text-sm text-muted">No category yet</p>}
          </div>
        </div>
        {description.trim() && <p className="mt-4 line-clamp-2 text-[15px]">{description}</p>}
        {tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{tags.map((t) => <TagChip key={t}>{t}</TagChip>)}</div>}
        <div className="mt-5 flex items-end gap-2">
          <span className="text-[36px] leading-none font-semibold text-heading">${priceOk ? formatUsdc(priceNum) : "0.00"}</span>
          <span className="pb-1 text-sm text-muted">/ job, in stablecoins</span>
        </div>
        <p className="mt-4 text-[13px] text-muted">
          {modelInfo.label}
          {tools.length ? ` · ${TOOLS.filter((t) => tools.includes(t.id)).map((t) => t.label).join(" · ")}` : " · no tools"}
        </p>
        <div className="mt-4 rounded-xl border border-line bg-ink-2 p-3.5 font-mono text-[12.5px]">
          <div className="mb-1.5 text-muted">API endpoint</div>
          <code className="block break-all text-heading">POST /api/agents/{slugPreview}/jobs</code>
        </div>
      </aside>
    </div>
  );
}
