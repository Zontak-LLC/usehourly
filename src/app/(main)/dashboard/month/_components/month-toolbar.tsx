"use client";

import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";

import { ProjectFilter } from "@/components/project-filter";
import { ShareExportMenu } from "@/components/share-export-menu";
import { Button } from "@/components/ui/button";
import { fromISODate, toISODate } from "@/lib/dates";
import type { SheetEntry } from "@/lib/timesheet";

/** First of the month as YYYY-MM-DD, shifted by `n` months. */
function shiftMonth(first: string, n: number): string {
  const d = fromISODate(first);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

export function MonthToolbar({
  first,
  last,
  today,
  monthDays,
  shown,
  selectMode,
  projectId,
  onToggleSelectMode,
  onProjectId,
  onFirst,
}: {
  first: string;
  last: string;
  today: string | null;
  monthDays: string[];
  /** The month's entries after the project filter; undefined while still loading. */
  shown: SheetEntry[] | undefined;
  selectMode: boolean;
  projectId: string;
  onToggleSelectMode: () => void;
  onProjectId: (id: string) => void;
  onFirst: (first: string) => void;
}) {
  return (
    <div
      data-testid="timesheet-toolbar"
      className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap sm:*:min-w-0 sm:*:flex-1"
    >
      <Button
        variant={selectMode ? "default" : "outline"}
        className="h-10 max-sm:flex-1"
        onClick={onToggleSelectMode}
        aria-pressed={selectMode}
      >
        <CalendarPlus /> Add to several days
      </Button>
      <ProjectFilter className="h-10 max-sm:flex-1" value={projectId} onChange={onProjectId} />
      <ShareExportMenu
        className="h-10 max-sm:flex-1"
        entries={shown}
        days={monthDays}
        filename={`usehourly-${first.slice(0, 7)}.xlsx`}
        period="month"
        defaultFrom={first}
        defaultTo={last}
        projectId={projectId}
      />
      <div className="flex items-center overflow-hidden rounded-lg border bg-card max-sm:w-full sm:min-w-44">
        <Button
          size="icon"
          variant="ghost"
          className="size-10 rounded-none"
          onClick={() => onFirst(shiftMonth(first, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          className="h-10 flex-1 rounded-none border-x"
          // Already showing this month: nothing to go back to (like the Today button on the Today page).
          disabled={!today || first === `${today.slice(0, 7)}-01`}
          onClick={() => today && onFirst(`${today.slice(0, 7)}-01`)}
        >
          This month
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-10 rounded-none"
          onClick={() => onFirst(shiftMonth(first, 1))}
          aria-label="Next month"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
