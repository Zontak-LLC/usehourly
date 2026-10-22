"use client";

import { useEffect, useState } from "react";

import { ChevronDown } from "lucide-react";

import { CardTitle } from "@/components/card-title";
import { FOLDED_KEY, readFolded } from "@/lib/folded-sections";

/**
 * A headed card whose body folds away behind a chevron (docs/ui-spec.md, "Folding"). The whole header is the button
 * (`aria-expanded`), a folded card still shows its title and a short `summary` (a total), and the choice is remembered
 * on this device per `id`. Use it for sections that are long or secondary, never for the page's main job.
 */
export function CollapsibleSection({
  id,
  title,
  note,
  summary,
  defaultOpen = true,
  children,
}: {
  /** Names the choice in storage and the region for a screen reader; keep it stable. */
  id: string;
  title: string;
  note?: string;
  /** Shown at the right of the header while the section is folded, e.g. "$4,171.25 earned". */
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    try {
      const saved = readFolded(localStorage.getItem(FOLDED_KEY))[id];
      if (saved !== undefined) setOpen(saved);
    } catch {
      // Storage can be blocked; the section then just follows its default.
    }
  }, [id]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(FOLDED_KEY, JSON.stringify({ ...readFolded(localStorage.getItem(FOLDED_KEY)), [id]: next }));
    } catch {
      // The choice just is not remembered.
    }
  }

  return (
    <section aria-label={title} className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-sheet)]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 bg-band-2 px-4 py-3 text-left"
      >
        <CardTitle as="span" title={title} note={note} />
        <span className="flex shrink-0 items-center gap-2 text-foreground/75 text-sm">
          {!open && summary && <span className="font-mono tabular-nums">{summary}</span>}
          <ChevronDown aria-hidden className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      <div id={`${id}-body`} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
