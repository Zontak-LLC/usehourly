"use client";

import { useState } from "react";

import { ChevronLeft, ChevronRight, Pencil, Search } from "lucide-react";

import { ProjectMark, useProjectLogos } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { isLongNote } from "@/lib/notes";
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
}: {
  entries: SheetEntry[];
  onOpenDay: (date: string) => void;
  period?: string;
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
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const matches = searchWorkItems(entries, query);
  const view = paginate(matches, page);
  const days = groupByDay(view.items, matches);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
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
              <h3 className="flex items-baseline justify-between gap-2 border-b bg-muted/40 px-4 py-2 font-medium text-sm">
                {dayFmt.format(fromISODate(g.date))}
                <span className="font-mono text-muted-foreground text-xs tabular-nums">
                  {formatDuration(g.minutes)}
                </span>
              </h3>
              <ul className="divide-y">
                {g.items.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onOpenDay(e.date)}
                      aria-label={`Edit ${dayFmt.format(fromISODate(e.date))}`}
                      className="group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm">
                          <ProjectMark projectId={e.project_id} color={e.project.client.color} logos={logos} />
                          <span className="truncate font-medium">{e.project.name}</span>
                          <span className="truncate text-muted-foreground">· {e.project.client.name}</span>
                        </span>
                        {e.note ? (
                          <span
                            className={`mt-0.5 block whitespace-pre-wrap break-words text-muted-foreground text-sm ${
                              isLongNote(e.note) && !open.has(e.id) ? "line-clamp-2" : ""
                            }`}
                          >
                            {e.note}
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-muted-foreground/60 text-sm italic">No description</span>
                        )}
                      </span>
                      <span className="shrink-0 pt-0.5 font-mono text-sm tabular-nums">
                        {e.started_at ? `${formatDuration(e.minutes)} +` : formatDuration(e.minutes)}
                      </span>
                      <Pencil
                        aria-hidden
                        className="mt-1 size-3.5 shrink-0 text-muted-foreground md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-visible:opacity-100"
                      />
                    </button>
                    {isLongNote(e.note) && (
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
