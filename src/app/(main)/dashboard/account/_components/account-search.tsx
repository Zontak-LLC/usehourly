"use client";

import { Database, FileText, Search, Sparkles, UserRound, X } from "lucide-react";

import { type AccountSectionId, rankSections } from "@/lib/account-search";

const ICONS = { account: UserRound, invoices: FileText, data: Database, ai: Sparkles } as const;

/**
 * The top of the Account page: a search box and a row of quick links. Typing moves the sections that match to the top
 * of the page (the page does that; this only holds the box), and the links jump straight to a section. Everything
 * stays on ONE page, so nothing is hidden behind a tab.
 */
export function AccountSearch({
  query,
  onQuery,
  onJump,
}: {
  query: string;
  onQuery: (next: string) => void;
  onJump: (id: AccountSectionId) => void;
}) {
  const ranked = rankSections(query);
  const first = ranked.find((s) => s.matches);
  const typing = query.trim() !== "";
  return (
    <div className="grid gap-3">
      <search className="relative block">
        <Search
          aria-hidden
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-4 size-4 text-foreground/60"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onQuery("");
          }}
          placeholder="Search your settings: password, export, currency, Claude…"
          aria-label="Search your settings"
          autoComplete="off"
          className="h-12 w-full rounded-full border bg-background pr-11 pl-11 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
        />
        {typing && (
          <button
            type="button"
            aria-label="Clear the search"
            onClick={() => onQuery("")}
            className="-translate-y-1/2 absolute top-1/2 right-2 grid size-8 place-items-center rounded-full text-foreground/70 hover:bg-muted"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </search>
      <nav aria-label="Jump to a section" className="flex flex-wrap items-center gap-2">
        <span className="text-foreground/70 text-sm">Jump to</span>
        {ranked.map((s) => {
          const Icon = ICONS[s.id];
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                onJump(s.id);
              }}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 font-medium text-sm transition-colors hover:bg-muted ${
                s.matches ? "border-foreground/40 bg-muted" : ""
              }`}
            >
              <Icon aria-hidden className="size-4" />
              {s.label}
            </a>
          );
        })}
      </nav>
      <p aria-live="polite" className="min-h-5 text-foreground/70 text-sm">
        {typing &&
          (first
            ? `Best match first: ${ranked
                .filter((s) => s.matches)
                .map((s) => s.label)
                .join(", ")}.`
            : "Nothing matches that. Every setting is still below.")}
      </p>
    </div>
  );
}
