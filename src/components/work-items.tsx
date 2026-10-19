"use client";

import { useState } from "react";

import { Ban, ChevronLeft, ChevronRight, Pencil, Search } from "lucide-react";

import { EntryRow } from "@/app/(main)/dashboard/today/_components/entry-row";
import { HoursChip } from "@/components/hours-chip";
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
    <section aria-label="What you worked on" className="overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-band-2 px-3 py-3 sm:px-4">
        <h2 className="font-semibold text-base">
          What you worked on <span className="font-normal text-foreground/75 text-sm">({matches.length})</span>
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
      </header>

      <div className="flex flex-col gap-4 p-3 sm:p-4">
        {view.total === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-sm">
            {query.trim() ? "Nothing matches that search." : `Nothing logged this ${period}.`}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {days.map((g) => (
              <section key={g.date} aria-label={dayFmt.format(fromISODate(g.date))} className="flex flex-col gap-2">
                <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 font-medium text-sm">
                  {dayFmt.format(fromISODate(g.date))}
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
                  {nonBillable?.has(g.date) && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-rose-600/40 px-2 py-0.5 font-medium text-foreground/80 text-xs dark:border-rose-400/40">
                      <Ban className="size-3" aria-hidden /> Non-billable
                    </span>
                  )}
                </h3>
                {/* One card per entry, the same card as on Today: its header carries Move, Edit and Delete (which asks first). */}
                <ul className="flex flex-col gap-2">
                  {g.items.map((e) => (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      bare
                      initialEditing={editInPlace && editing.has(e.id)}
                      onEditDone={() => stopEditing(e.id)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {view.total > 0 && (
          <div className="flex items-center justify-between gap-2">
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
    </section>
  );
}
