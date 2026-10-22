"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { ArrowRight, Search } from "lucide-react";

import { StopSlider } from "@/components/stop-slider";
import { Input } from "@/components/ui/input";
import { searchGuide } from "@/lib/guide-search";

/** How deep a group is: 0 = logging time, 1 = billing and sharing, 2 = the rest. */
const depthOf = (group: string) => (group === "time" ? 0 : group === "billing" || group === "sharing" ? 1 : 2);

const SUGGESTIONS = ["round", "offline", "free", "budget", "calendar", "currency", "team"] as const;

const START_HERE = [
  { slug: "typing-time", title: "Log your time", hint: "Type 1.5, 90m or 1h30 and press Enter." },
  { slug: "making-an-invoice", title: "Make an invoice", hint: "Billable hours become a PDF in two clicks." },
  { slug: "paid-and-year-summary", title: "Get paid, then file", hint: "Mark it paid; the year summary adds up." },
] as const;

type TopicItem = { slug: string; title: string; group: string; summary: string; keywords: string[]; body: string };
type FaqEntry = { id: string; question: string; answer: string; keywords: string[] };

/** The guide's front page: a search box that works on the device (so also offline), then the topics by group. */
export function GuideSearch({
  topics,
  faq,
  groups,
}: {
  topics: TopicItem[];
  faq: FaqEntry[];
  groups: { id: string; title: string }[];
}) {
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState(2);
  const box = useRef<HTMLInputElement>(null);
  // The placeholder cycles through example searches, a new one every few seconds (still when motion is reduced).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTick((n) => n + 1), 2600);
    return () => clearInterval(id);
  }, []);
  const hint = SUGGESTIONS[tick % SUGGESTIONS.length];
  // "/" jumps to the search box from anywhere on the page (unless the person is already typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || el?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      box.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const q = query.trim();
  const topicHits = searchGuide(
    topics.map((t) => ({ ...t, id: t.slug })),
    q,
  );
  const faqHits = searchGuide(
    faq.map((f) => ({ id: f.id, title: f.question, summary: "", keywords: f.keywords, body: f.answer })),
    q,
  );

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* Start here: the three things almost everyone does, in order, each one a link into the guide. */}
      <ol className="grid gap-3 sm:grid-cols-3">
        {START_HERE.map((step, n) => (
          <li key={step.slug}>
            <Link
              href={`/help/${step.slug}`}
              prefetch={false}
              className="group/start relative flex h-full flex-col gap-1 overflow-hidden rounded-3xl bg-gradient-to-b from-card to-muted p-4 text-foreground shadow-[var(--shadow-sheet)] ring-1 ring-foreground/15 transition-all duration-200 hover:ring-amber/70 motion-safe:hover:-translate-y-0.5"
            >
              <span className="font-mono text-[11px] text-amber uppercase tracking-widest">Step {n + 1}</span>
              <span className="font-bold font-display text-xl">{step.title}</span>
              <span className="text-foreground/75 text-sm">{step.hint}</span>
              <ArrowRight
                aria-hidden
                className="absolute right-4 bottom-4 size-4 text-amber transition-transform group-hover/start:translate-x-1"
              />
            </Link>
          </li>
        ))}
      </ol>
      {/* How deep to go: the slider hides the groups past its stop (it starts on Everything, so nothing is hidden). */}
      <div className="grid gap-1 rounded-3xl border bg-card px-4 py-3 shadow-[var(--shadow-sheet)]">
        <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
          How much do you want to read?
        </span>
        <StopSlider
          name="guideDepth"
          label="How much of the guide to show"
          defaultValue={2}
          onChange={setDepth}
          options={[
            { value: 0, label: "Just logging time" },
            { value: 1, label: "Billing clients" },
            { value: 2, label: "Everything" },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={box}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search the guide: try “${hint}”`}
            aria-label="Search the guide"
            className="h-12 rounded-2xl pr-12 pl-10 text-base"
          />
          {/* the shortcut: pressing / anywhere on the page jumps here */}
          <kbd
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md border bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs max-sm:hidden"
          >
            /
          </kbd>
        </div>
        <ul className="flex flex-wrap items-center gap-2" aria-label="Try searching for">
          {SUGGESTIONS.map((word) => (
            <li key={word}>
              <button
                type="button"
                onClick={() => {
                  setQuery(word);
                  box.current?.focus();
                }}
                className="rounded-full border bg-muted/50 px-3 py-1 font-mono text-xs transition-all hover:border-amber hover:bg-amber/15 motion-safe:active:scale-95"
              >
                {word}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {q ? (
        <section aria-live="polite" className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            {topicHits.length + faqHits.length === 0
              ? "Nothing matches that. Try a different word, or browse the topics below."
              : `${topicHits.length + faqHits.length} result${topicHits.length + faqHits.length === 1 ? "" : "s"}`}
          </p>
          <ul className="flex flex-col gap-2">
            {topicHits.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/help/${t.slug}`}
                  prefetch={false}
                  className="block rounded-xl border bg-card p-4 hover:bg-muted"
                >
                  <span className="font-medium">{t.title}</span>
                  <span className="block text-muted-foreground text-sm">{t.summary}</span>
                </Link>
              </li>
            ))}
            {faqHits.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/help/faq#${f.id}`}
                  prefetch={false}
                  className="block rounded-xl border bg-card p-4 hover:bg-muted"
                >
                  <span className="font-medium">{f.title}</span>
                  <span className="block text-muted-foreground text-sm">Question</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {q && topicHits.length + faqHits.length > 0 ? null : (
        <div className="flex flex-col gap-10">
          {groups
            .filter((g) => depthOf(g.id) <= depth)
            .map((g, gi) => (
              <section
                key={g.id}
                aria-labelledby={`g-${g.id}`}
                className="grid gap-4 border-foreground/10 border-t-2 pt-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
              >
                {/* the chapter: a big number and its name, kept in view beside the list on a wide screen */}
                <div className="lg:sticky lg:top-24 lg:self-start">
                  <span aria-hidden className="font-display font-extrabold text-5xl text-amber leading-none">
                    {String(gi + 1).padStart(2, "0")}
                  </span>
                  <h2 id={`g-${g.id}`} className="mt-2 font-display font-extrabold text-2xl leading-tight">
                    {g.title}
                  </h2>
                </div>
                <ul className="divide-y divide-foreground/10">
                  {topics
                    .filter((t) => t.group === g.id)
                    .map((t, n) => (
                      <li key={t.slug}>
                        <Link
                          href={`/help/${t.slug}`}
                          prefetch={false}
                          className="group/topic relative -mx-3 flex items-center gap-4 rounded-2xl px-3 py-4 outline-none transition-colors hover:bg-amber/10 focus-visible:ring-4 focus-visible:ring-amber/40"
                        >
                          <span aria-hidden className="w-6 shrink-0 font-mono text-foreground/60 text-xs">
                            {String(n + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-bold font-display text-lg leading-snug">{t.title}</span>
                            <span className="mt-0.5 block text-foreground/75 text-sm">{t.summary}</span>
                          </span>
                          <span
                            aria-hidden
                            className="grid size-9 shrink-0 place-items-center rounded-full bg-muted transition-all duration-200 group-hover/topic:translate-x-1 group-hover/topic:bg-amber group-hover/topic:text-[#1b1405]"
                          >
                            <ArrowRight className="size-4" />
                          </span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          <p className="text-sm">
            Short answers to common questions are in the{" "}
            <Link href="/help/faq" prefetch={false} className="underline underline-offset-4">
              FAQ
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
