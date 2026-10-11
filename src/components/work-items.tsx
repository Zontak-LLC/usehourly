"use client";

import { useState } from "react";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { ProjectMark, useProjectLogos } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import type { SheetEntry } from "@/lib/timesheet";
import { paginate, searchWorkItems } from "@/lib/work-items";

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

/**
 * A period's entries as a searchable list, 7 per page. Click a row to edit that day.
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
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const matches = searchWorkItems(entries, query);
  const view = paginate(matches, page);

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="font-medium">
          Work items <span className="font-normal text-muted-foreground text-sm">({matches.length})</span>
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
            aria-label="Search work items"
            className="h-9 pl-8"
          />
        </div>
      </div>

      {view.total === 0 ? (
        <p className="px-4 py-8 text-center text-muted-foreground text-sm">
          {query.trim() ? "No work items match that search." : `No work items this ${period}.`}
        </p>
      ) : (
        <ul className="divide-y">
          {view.items.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onOpenDay(e.date)}
                title="Edit this day"
                className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted"
              >
                <span className="w-24 shrink-0 pt-0.5 text-muted-foreground text-xs">
                  {dayFmt.format(fromISODate(e.date))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm">
                    <ProjectMark projectId={e.project_id} color={e.project.client.color} logos={logos} />
                    <span className="truncate font-medium">{e.project.name}</span>
                    <span className="truncate text-muted-foreground">· {e.project.client.name}</span>
                  </span>
                  {e.note ? (
                    <span className="mt-0.5 block whitespace-pre-wrap break-words text-muted-foreground text-sm">
                      {e.note}
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-muted-foreground/60 text-sm italic">No description</span>
                  )}
                </span>
                <span className="shrink-0 pt-0.5 font-mono text-sm tabular-nums">
                  {e.started_at ? `${formatDuration(e.minutes)} +` : formatDuration(e.minutes)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {view.total > 0 && (
        <div className="flex items-center justify-between gap-2 border-t px-4 py-2">
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
