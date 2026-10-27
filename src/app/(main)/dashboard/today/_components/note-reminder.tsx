"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronRight, NotebookPen } from "lucide-react";

import { NOTE_SAVED_EVENT, openNote } from "@/components/inline-note";
import { Button } from "@/components/ui/button";
import { loadNotNow, NOTE_NOT_NOW_KEY, saveNotNow } from "@/lib/day-nav";
import { entriesWithoutNote, nextWithoutNote, noteReminder, noteReminderText } from "@/lib/note-later";
import { safeStorage } from "@/lib/offline-cache";

type Entry = { id: string; note: string; started_at: Date | string | null };

/**
 * The end-of-day line in Today's day card (2026-10-24, "log first, note later"): "2 entries have no note yet. Clients
 * see notes on invoices." with **Add notes** (opens the first one's note box in its row; Enter there saves it and
 * opens the next) and **Not now** (hides it for that date on this device, the same storage rule as the missed-day
 * line). Today or a past day only, once the day has an entry. In the app only: no email ever says this.
 */
export function NoteReminder({ entries, date, today }: { entries: Entry[]; date: string; today: string | null }) {
  const [notNow, setNotNow] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => setNotNow(loadNotNow(safeStorage(), NOTE_NOT_NOW_KEY)), []);
  // "Add notes" walks through the day: each note saved with Enter opens the next entry that has none.
  const walking = useRef(false);
  const latest = useRef(entries);
  latest.current = entries;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a walk belongs to one day
  useEffect(() => {
    walking.current = false;
  }, [date]);
  useEffect(() => {
    const onSaved = (e: Event) => {
      if (!walking.current) return;
      const next = nextWithoutNote(latest.current, (e as CustomEvent<string>).detail);
      if (next) openNote(next);
      else walking.current = false;
    };
    window.addEventListener(NOTE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(NOTE_SAVED_EVENT, onSaved);
  }, []);

  const count = noteReminder(entries, date, today, notNow);
  if (count === 0) return null;
  return (
    <section
      aria-label="Entries with no note"
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted/70 px-3 py-2 text-foreground/80 text-sm"
    >
      {/* On a phone the sentence takes its own line and the buttons go under it (walkthrough 2026-10-25: squeezed beside
          them it was a six-line column); the buttons are full finger size there. */}
      <span className="inline-flex min-w-0 flex-1 items-center gap-2 max-sm:basis-full">
        <NotebookPen aria-hidden className="size-4 shrink-0" />
        <span>
          <span className="font-medium text-foreground">{noteReminderText(count)}</span> Clients see notes on invoices.
        </span>
      </span>
      <span className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 max-sm:h-11"
          onClick={() => {
            const first = entriesWithoutNote(entries)[0];
            if (!first) return;
            walking.current = true;
            openNote(first.id);
          }}
        >
          Add notes
          <ChevronRight aria-hidden />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 max-sm:h-11"
          onClick={() => setNotNow(saveNotNow(safeStorage(), date, NOTE_NOT_NOW_KEY))}
        >
          Not now
        </Button>
      </span>
    </section>
  );
}
