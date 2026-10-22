"use client";

import { Database, FileText, Sparkles, UserRound } from "lucide-react";

import { SECTIONS } from "./account-section";

const ICONS = { account: UserRound, data: Database, invoices: FileText, ai: Sparkles } as const;
type SectionId = (typeof SECTIONS)[number]["id"];

/** Quick links to the sections of the one-page Account (searching is in the top bar, on every page). */
export function AccountJump({ onJump }: { onJump: (id: SectionId) => void }) {
  return (
    <nav aria-label="Jump to a section" className="flex flex-wrap items-center gap-2">
      <span className="text-foreground/70 text-sm">Jump to</span>
      {SECTIONS.map((s) => {
        const Icon = ICONS[s.id];
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => {
              e.preventDefault();
              onJump(s.id);
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 font-medium text-sm transition-colors hover:bg-muted"
          >
            <Icon aria-hidden className="size-4" />
            {s.label}
          </a>
        );
      })}
    </nav>
  );
}
