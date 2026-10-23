"use client";

import { type ReactNode, useState } from "react";

import { ChevronDown } from "lucide-react";

/**
 * The period's full list of entries, folded behind one row (Week and Month). The page already shows the time by day, so
 * the long list is there when you need to search or edit any day, not in the way when you don't.
 */
export function AllEntriesFold({ period, count, children }: { period: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // With nothing to list the button would open nothing (the list renders nothing for no entries), so it is not shown.
  if (count === 0) return null;
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center justify-between rounded-2xl bg-card px-4 text-left text-sm ring-1 ring-foreground/10 hover:ring-foreground/30"
      >
        <span>
          <span className="font-semibold">All entries this {period}</span>
          <span className="text-foreground/70"> · {count} · search and edit any day</span>
        </span>
        <ChevronDown className={`size-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && children}
    </>
  );
}
