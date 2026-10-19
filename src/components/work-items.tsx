"use client";

import { useState } from "react";

import { Ban, ChevronLeft, ChevronRight, Pencil, Search } from "lucide-react";

import { EntryRow } from "@/app/(main)/dashboard/today/_components/entry-row";
import { NoteText } from "@/components/folded-note";
import { HoursChip } from "@/components/hours-chip";
import { ProjectMark, useProjectLogos } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import type { SheetEntry } from "@/lib/timesheet";
import { groupByDay, paginate, searchWorkItems } from "@/lib/work-items";

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

/**
 * What you worked on in a period: searchable, grouped by day (with the day's total), 7 entries per page. Click a row to edit that day.
 * `period` words the empty state ("month", "week").
 */
export function WorkItems({
  entries,
  onOpenDay,
  period = "month",
  editInPlace = false,
  nonBillable,
}: {
  entries: SheetEntry[];
  onOpenDay: (date: string) => void;
  period?: string;
  /** Edit an entry right where it sits in the list (no jump to the day editor). */
  editInPlace?: boolean;
  /** Dates marked non-billable: their header carries a badge. */
  nonBillable?: ReadonlySet<string>;
}) {
  const logos = useProjectLogos();
  // Long notes fold to two lines; the ids here are the ones the user opened.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  // Entries whose note is cut off right now (measured, not guessed from its length).
  const [clipped, setClipped] = useState<ReadonlySet<string>>(new Set());
  const markClipped = (id: string, is: boolean) =>
    setClipped((prev) => {
      if (prev.has(id) === is) return prev;
      const next = new Set(prev);
      if (is) next.add(id);
      else next.delete(id);
      return next;
    });
  // Entries open for editing in place (only used with `editInPlace`).
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set());
  const startEditing = (ids: string[]) => setEditing((prev) => new Set([...prev, ...ids]));
  const stopEditing = (id: string) =>
    setEditing((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const matches = searchWorkItems(entries, query);
  const view = paginate(matches, page);
  const days = groupByDay(view.items, matches);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-base">
          What you worked on <span className="font-normal text-muted-foreground text-sm">({matches.length})</span>
        </h2>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1); // a new search always starts on its first page
            }}
            placeholder="Search note, project, client…"
            aria-label="Search what you worked on"
            className="h-9 pl-8"
          />
        </div>
      </div>

      {view.total === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-8 text-center text-muted-foreground text-sm">
          {query.trim() ? "Nothing matches that search." : `Nothing logged this ${period}.`}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {days.map((g) => (
            <section
              key={g.date}
              aria-label={dayFmt.format(fromISODate(g.date))}
              className="overflow-hidden rounded-xl border bg-card"
            >
              <h3 className="flex items-center justify-between gap-2 border-b bg-muted/40 py-1 pr-2 pl-4 font-medium text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {dayFmt.format(fromISODate(g.date))}
                  {nonBillable?.has(g.date) && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-rose-600/40 px-2 py-0.5 font-medium text-foreground/80 text-xs dark:border-rose-400/40">
                      <Ban className="size-3" aria-hidden /> Non-billable
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <HoursChip>
                    {formatDuration(g.minutes)}
                    {g.items.length === 1 && g.items[0].minutes === g.minutes && g.items[0].started_at ? " +" : ""}
                  </HoursChip>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-8"
                    onClick={() =>
                      editInPlace
                        ? startEditing(g.items.filter((e) => !e.started_at).map((e) => e.id))
                        : onOpenDay(g.date)
                    }
                    aria-label={`Edit ${dayFmt.format(fromISODate(g.date))}`}
                    title="Edit this day"
                  >
                    <Pencil />
                  </Button>
                </span>
              </h3>
              <ul className="divide-y">
                {g.items.map((e) => (
                  <li key={e.id}>
                    {editInPlace && editing.has(e.id) ? (
                      <ul>
                        <EntryRow entry={e} initialEditing bare onEditDone={() => stopEditing(e.id)} />
                      </ul>
                    ) : (
                      <button
                        type="button"
                        onClick={() => (editInPlace && !e.started_at ? startEditing([e.id]) : onOpenDay(e.date))}
                        title="Edit this day"
                        className="group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-sm">
                            <ProjectMark projectId={e.project_id} color={e.project.client.color} logos={logos} />
                            <span className="truncate font-medium">{e.project.name}</span>
                            <span className="truncate text-muted-foreground">· {e.project.client.name}</span>
                            {/* A day with one entry shows its time in the header; with several, each row says its own, beside the name. */}
                            {!(g.items.length === 1 && g.items[0].minutes === g.minutes) && (
                              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium font-mono text-xs tabular-nums">
                                {e.started_at ? `${formatDuration(e.minutes)} +` : formatDuration(e.minutes)}
                              </span>
                            )}
                          </span>
                          {e.note ? (
                            <NoteText
                              note={e.note}
                              expanded={open.has(e.id)}
                              onClipped={(is) => markClipped(e.id, is)}
                            />
                          ) : (
                            <span className="mt-0.5 block text-muted-foreground/60 text-sm italic">No description</span>
                          )}
                        </span>
                      </button>
                    )}
                    {!(editInPlace && editing.has(e.id)) && (clipped.has(e.id) || open.has(e.id)) && (
                      <button
                        type="button"
                        onClick={() => toggle(e.id)}
                        aria-expanded={open.has(e.id)}
                        className="mb-2 min-h-6 pl-4 text-primary text-xs hover:underline"
                      >
                        {open.has(e.id) ? "Show less" : "Show more"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {view.total > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border bg-card px-4 py-2">
          <p className="text-muted-foreground text-xs">
            Showing {view.from}–{view.to} of {view.total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              onClick={() => setPage(view.page - 1)}
              disabled={view.page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <span className="px-2 text-muted-foreground text-xs tabular-nums">
              Page {view.page} of {view.pages}
            </span>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setPage(view.page + 1)}
              disabled={view.page >= view.pages}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
