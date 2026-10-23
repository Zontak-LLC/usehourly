"use client";

import { useState } from "react";

import { ChevronLeft, ChevronRight, Pencil, Search } from "lucide-react";

import { EntryRow } from "@/app/(main)/dashboard/today/_components/entry-row";
import { HoursChip } from "@/components/hours-chip";
import { NoDollar } from "@/components/no-dollar-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePageSize } from "@/components/use-page-size";
import { DateBlock, ProjectGroups, WorkToolbar } from "@/components/work-filter";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import type { SheetEntry } from "@/lib/timesheet";
import { groupByDay, groupByProject, orderByProject, paginate, searchWorkItems } from "@/lib/work-items";

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

/**
 * What you worked on in a period: searchable, grouped by day (with the day's total), 3 entries per page on a phone and 10 on a wide screen. Click a row to edit that day.
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
  // Every editable entry of the day is open: the day's button then shows "Done editing" and closes them.
  const dayEditing = (items: SheetEntry[]) => {
    const editable = items.filter((e) => !e.started_at);
    return editable.length > 0 && editable.every((e) => editing.has(e.id));
  };
  const stopEditingMany = (ids: string[]) =>
    setEditing((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  const stopEditing = (id: string) =>
    setEditing((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  // The list is by day (the default) or by project; both are the same entries, grouped differently.
  const [mode, setMode] = useState<"day" | "project">("day");

  const found = searchWorkItems(entries, query);
  const matches = mode === "project" ? orderByProject(found) : found;
  const pageSize = usePageSize();
  const view = paginate(matches, page, pageSize);
  const days = mode === "day" ? groupByDay(view.items, matches) : [];
  const byProject = mode === "project" ? groupByProject(view.items, matches) : [];

  // Nothing logged in this period: there is nothing to list, so the section is not shown at all (a search that finds
  // nothing still shows it, so the box stays to be cleared).
  if (entries.length === 0) return null;

  return (
    <section
      aria-label="What you worked on"
      className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-sheet)]"
    >
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
            clearable
            className="h-9 pl-8"
          />
        </div>
      </header>

      <WorkToolbar
        mode={mode}
        onMode={(next) => {
          setMode(next);
          setPage(1);
        }}
        projectId=""
      />

      <div className="flex flex-col gap-4 p-3 sm:p-4">
        {view.total === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-sm">
            {query.trim() ? "Nothing matches that search." : `Nothing logged this ${period}.`}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <ProjectGroups groups={byProject} editInPlace={editInPlace} editing={editing} onEditDone={stopEditing} />
            {days.map((g) => (
              <section
                key={g.date}
                aria-label={dayFmt.format(fromISODate(g.date))}
                className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-3 sm:gap-4"
              >
                {/* The day as a small calendar leaf at the left: the date is the label of the group, not another column. */}
                <DateBlock date={g.date} />
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <h3 className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-medium text-sm">
                      <span className="sr-only">{dayFmt.format(fromISODate(g.date))}</span>
                      <HoursChip label="Total">
                        {formatDuration(g.minutes)}
                        {g.items.length === 1 && g.items[0].minutes === g.minutes && g.items[0].started_at ? " +" : ""}
                      </HoursChip>
                      {nonBillable?.has(g.date) && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full border border-rose-600/40 px-2 py-0.5 font-medium text-foreground/80 text-xs dark:border-rose-400/40">
                          <NoDollar className="size-3" /> Non-billable
                        </span>
                      )}
                    </h3>
                    {/* Words, not just an icon: the entry cards below each have their own pencil, and this one edits the whole day.
                    A second click closes what the first opened. */}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      aria-expanded={editInPlace ? dayEditing(g.items) : undefined}
                      onClick={() => {
                        if (!editInPlace) return onOpenDay(g.date);
                        const ids = g.items.filter((e) => !e.started_at).map((e) => e.id);
                        return dayEditing(g.items) ? stopEditingMany(ids) : startEditing(ids);
                      }}
                      aria-label={`${editInPlace && dayEditing(g.items) ? "Stop editing" : "Edit"} ${dayFmt.format(fromISODate(g.date))}`}
                      title={
                        editInPlace && dayEditing(g.items)
                          ? "Close the edit forms of this day"
                          : "Edit every entry of this day"
                      }
                    >
                      <Pencil /> {editInPlace && dayEditing(g.items) ? "Done editing" : "Edit day"}
                    </Button>
                  </div>
                  {/* The day is the card; its entries are rows in one list (cards group, rows list). Each row carries Edit and a ··· menu. */}
                  <ul className="divide-y divide-foreground/10">
                    {g.items.map((e) => (
                      <EntryRow
                        // The card reads "start in edit mode" only when it is first shown, so a change of that flag (the
                        // day's Edit day button) must show a fresh card, or the button would do nothing.
                        key={`${e.id}-${editInPlace && editing.has(e.id) ? "edit" : "view"}`}
                        entry={e}
                        bare
                        initialEditing={editInPlace && editing.has(e.id)}
                        onEditDone={() => stopEditing(e.id)}
                      />
                    ))}
                  </ul>
                </div>
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
