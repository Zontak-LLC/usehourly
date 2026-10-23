"use client";

import { useState } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { ProjectFilter } from "@/components/project-filter";
import { ShareExportMenu, SharePanel, type SharePanelKind } from "@/components/share-export-menu";
import { Button } from "@/components/ui/button";
import { addDays, fromISODate, startOfWeek } from "@/lib/dates";
import type { SheetEntry } from "@/lib/timesheet";

const range = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function WeekToolbar({
  start,
  end,
  today,
  days,
  shown,
  projectId,
  onProjectId,
  onWeek,
}: {
  start: string;
  end: string;
  today: string | null;
  days: string[];
  /** The week's entries after the project filter; undefined while still loading. */
  shown: SheetEntry[] | undefined;
  projectId: string;
  onProjectId: (id: string) => void;
  onWeek: (start: string) => void;
}) {
  const [open, setOpen] = useState<{ kind: SharePanelKind; n: number } | null>(null);
  // A new menu choice (even the same one again) starts the form fresh; so does moving to another period or project.
  const choose = (kind: SharePanelKind) => setOpen((o) => ({ kind, n: (o?.n ?? 0) + 1 }));
  return (
    <div className="flex w-full flex-col gap-3">
      {/* Moving between weeks is what people do most, so it comes first and names the dates; the filter and Export
          are quieter and sit at the end. "This week" only shows when you are looking at another week. */}
      <div data-testid="timesheet-toolbar" className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 max-sm:w-full">
          <div className="flex items-center overflow-hidden rounded-lg border border-foreground/25 bg-card max-sm:flex-1">
            <Button
              size="icon"
              variant="ghost"
              className="size-10 rounded-none"
              onClick={() => onWeek(addDays(start, -7))}
              aria-label="Previous week"
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-36 flex-1 border-x px-3 text-center font-medium text-sm tabular-nums leading-10">
              {range.format(fromISODate(start))} – {range.format(fromISODate(end))}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-10 rounded-none"
              onClick={() => onWeek(addDays(start, 7))}
              aria-label="Next week"
            >
              <ChevronRight />
            </Button>
          </div>
          {today && startOfWeek(today) !== start && (
            <Button variant="outline" className="h-10" onClick={() => onWeek(startOfWeek(today))}>
              This week
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 max-sm:w-full">
          <ProjectFilter className="h-10 max-sm:flex-1 sm:w-48" value={projectId} onChange={onProjectId} />
          <ShareExportMenu
            className="h-10 border-foreground/25 bg-card max-sm:flex-1 dark:bg-card"
            entries={shown}
            days={days}
            filename={`usehourly-${start}_to_${end}.xlsx`}
            period="week"
            onPanel={choose}
          />
        </div>
      </div>
      <SharePanel
        key={`${open?.n}:${start}:${end}:${projectId}`}
        panel={open?.kind ?? null}
        onClose={() => setOpen(null)}
        defaultFrom={start}
        defaultTo={end}
        projectId={projectId}
      />
    </div>
  );
}
