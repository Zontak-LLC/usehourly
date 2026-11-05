"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { useSearchParams } from "next/navigation";

import { cn } from "cn";
import { ChevronDown, Search } from "lucide-react";

import { GuideBody } from "@/components/guide/guide-body";
import { searchGuide } from "@/lib/guide-search";

import { AskQuestion } from "./ask-question";

export type HelpItem = {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  common: boolean;
  oldSlugs: string[];
};

/** Words offered under the empty search box. Each shows only when it finds an answer this release shows. */
const SUGGESTIONS = ["timer", "rate", "excel", "paid", "dark mode", "currency", "password"];

const words = (s: string) => s.toLowerCase().match(/[a-z0-9$%']+/g) ?? [];

/**
 * The Help page: one search box first, then the common questions. Every answer opens in place; searching finds the
 * rest. `?a=<id>` (or an old `#anchor`) opens one answer, `?q=<words>` fills the search. Runs in the browser, so it
 * answers as you type. `signedIn` only decides whether "Still stuck?" offers the question form or a sign-in link.
 */
export function HelpCenter({ answers, signedIn }: { answers: HelpItem[]; signedIn: boolean }) {
  const params = useSearchParams();
  const asked = params.get("a");
  const typed = params.get("q");
  const box = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(typed ?? "");
  const [focus, setFocus] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  // The answers never change while the page is open; a ref keeps a re-sent copy from re-running the effect below
  // (which would wipe what the person typed since).
  const all = useRef(answers);
  all.current = answers;

  /** Opens one answer and shows it at the top of the list, clearing the search. */
  const openAnswer = useCallback((wanted: string) => {
    const item = all.current.find((a) => a.id === wanted) ?? all.current.find((a) => a.oldSlugs.includes(wanted));
    if (!item) return false;
    setQuery("");
    setFocus(item.id);
    setOpen((o) => new Set(o).add(item.id));
    requestAnimationFrame(() => document.getElementById(`answer-${item.id}`)?.scrollIntoView({ block: "start" }));
    return true;
  }, []);

  // Follow the address: ?a=<id> or an old FAQ #anchor opens that answer, ?q=<words> fills the search. Runs only when
  // the address changes.
  useEffect(() => {
    const wanted = asked ?? window.location.hash.slice(1);
    if (wanted && openAnswer(wanted)) return;
    if (typed !== null) setQuery(typed);
  }, [asked, typed, openAnswer]);

  // A link inside an answer to another answer (/help?a=<id>) opens it here even when the address is already that one
  // (the address then does not change, so the effect above would not run).
  const onAnswerLink = (e: React.MouseEvent) => {
    const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
    const id = href?.match(/^\/help\?a=([a-z0-9-]+)$/)?.[1];
    if (id) openAnswer(id);
  };

  // The box is ready to type in on a computer (not on a phone, where focusing it would pop the keyboard up), and
  // "/" jumps to it from anywhere on the page.
  useEffect(() => {
    if (!asked && window.matchMedia("(pointer: fine)").matches) box.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || el?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      box.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asked]);

  const searchable = answers.map((a) => ({ ...a, title: a.question, summary: "", body: a.answer }));
  const q = query.trim();
  const hits = q ? searchGuide(searchable, q) : [];
  const terms = words(q);
  const suggestions = SUGGESTIONS.filter((w) => searchGuide(searchable, w).length > 0);
  const focused = answers.find((a) => a.id === focus && !a.common);
  const shown = q ? hits : [...(focused ? [focused] : []), ...answers.filter((a) => a.common)];
  const toggle = (id: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={box}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search: try “timer” or “invoice”"
            aria-label="Search help"
            autoComplete="off"
            className="h-14 w-full rounded-2xl border border-input bg-card pr-12 pl-12 text-base shadow-[var(--shadow-sheet)] outline-none transition-[box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
          />
          {!query && (
            <kbd
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 rounded-md border bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs max-sm:hidden"
            >
              /
            </kbd>
          )}
        </div>
        {!q && suggestions.length > 0 && (
          <ul className="flex flex-wrap items-center gap-2" aria-label="Try searching for">
            {suggestions.map((word) => (
              <li key={word}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery(word);
                    box.current?.focus();
                  }}
                  className="min-h-9 rounded-full border bg-card px-3.5 text-sm transition-colors hover:border-foreground/30 hover:bg-muted"
                >
                  {word}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: it only catches clicks on the links inside the answers, which are real links (Enter on them is a click) */}
      <section aria-labelledby="help-list" className="flex flex-col gap-3" onClick={onAnswerLink}>
        <h2 id="help-list" aria-live="polite" className="font-medium text-muted-foreground text-sm">
          {q ? (hits.length === 0 ? `No answer matches “${q}”` : answerCount(hits.length)) : "Common questions"}
        </h2>
        {shown.length > 0 && (
          <ul className="divide-y divide-foreground/10 overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10">
            {shown.map((a) => (
              <AnswerRow key={a.id} item={a} terms={terms} open={open.has(a.id)} onToggle={() => toggle(a.id)} />
            ))}
          </ul>
        )}
        {q && hits.length === 0 && (
          <p className="text-sm">
            Try fewer or other words, or{" "}
            <button type="button" onClick={() => setQuery("")} className="underline underline-offset-4">
              see the common questions
            </button>
            .
          </p>
        )}
      </section>

      <AskQuestion signedIn={signedIn} />
    </div>
  );
}

const answerCount = (n: number) => `${n} answer${n === 1 ? "" : "s"}`;

/** One question: a button that opens its answer right under it. */
function AnswerRow({
  item,
  terms,
  open,
  onToggle,
}: {
  item: HelpItem;
  terms: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const body = `answer-${item.id}-body`;
  return (
    <li id={`answer-${item.id}`} className={cn("scroll-mt-24 transition-colors", open && "bg-muted/40")}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          onClick={onToggle}
          className="flex w-full items-center gap-4 px-5 py-4 text-left font-semibold text-base outline-none hover:bg-muted/60 focus-visible:bg-muted/60 sm:px-6 sm:text-lg"
        >
          <span className="min-w-0 flex-1">
            <Highlight text={item.question} terms={terms} />
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-5 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </h3>
      {open && (
        <div id={body} className="px-5 pb-5 text-foreground/85 sm:px-6 [&_a]:text-foreground">
          <GuideBody markdown={item.answer} />
        </div>
      )}
    </li>
  );
}

/** The question with the words that matched the search marked. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  // each part keyed by where it starts in the question, which is unique and never moves
  let at = 0;
  const parts = text
    .split(/([a-z0-9$%']+)/i)
    .filter(Boolean)
    .map((part) => {
      const start = at;
      at += part.length;
      return { part, start, hit: terms.some((t) => part.toLowerCase().startsWith(t)) };
    });
  return (
    <>
      {parts.map(({ part, start, hit }) =>
        hit ? (
          <mark
            key={start}
            className="rounded bg-amber/30 px-0.5 text-foreground dark:bg-transparent dark:px-0 dark:text-amber"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={start}>{part}</Fragment>
        ),
      )}
    </>
  );
}
