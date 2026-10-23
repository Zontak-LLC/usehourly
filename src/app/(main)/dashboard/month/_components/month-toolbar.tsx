"use client";

import { useState } from "react";

import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";

import { ProjectFilter } from "@/components/project-filter";
import { ShareExportMenu, SharePanel, type SharePanelKind } from "@/components/share-export-menu";
import { Button } from "@/components/ui/button";
import { addMonths, fromISODate } from "@/lib/dates";
import { feature } from "@/lib/features";
import type { SheetEntry } from "@/lib/timesheet";

const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

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
  const [open, setOpen] = useState<{ kind: SharePanelKind; n: number } | null>(null);
  // A new menu choice (even the same one again) starts the form fresh; so does moving to another period or project.
  const choose = (kind: SharePanelKind) => setOpen((o) => ({ kind, n: (o?.n ?? 0) + 1 }));
  return (
    <div className="flex w-full flex-col gap-3">
      {/* Same order as Week: moving between months first (it names the month), then the filter and Export at the end.
          "This month" only shows when you are looking at another month. */}
      <div data-testid="timesheet-toolbar" className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 max-sm:w-full">
          <div className="flex items-center overflow-hidden rounded-lg border border-foreground/25 bg-card max-sm:flex-1">
            <Button
              size="icon"
              variant="ghost"
              className="size-10 rounded-none"
              onClick={() => onFirst(addMonths(first, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-36 flex-1 border-x px-3 text-center font-medium text-sm leading-10">
              {monthLabel.format(fromISODate(first))}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-10 rounded-none"
              onClick={() => onFirst(addMonths(first, 1))}
              aria-label="Next month"
            >
              <ChevronRight />
            </Button>
          </div>
          {today && first !== `${today.slice(0, 7)}-01` && (
            <Button variant="outline" className="h-10" onClick={() => onFirst(`${today.slice(0, 7)}-01`)}>
              This month
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 max-sm:w-full">
          <ProjectFilter className="h-10 max-sm:flex-1 sm:w-48" value={projectId} onChange={onProjectId} />
          <ShareExportMenu
            className="h-10 border-foreground/25 bg-card max-sm:flex-1 dark:bg-card"
            entries={shown}
            days={monthDays}
            filename={`usehourly-${first.slice(0, 7)}.xlsx`}
            period="month"
            onPanel={choose}
          />
          {feature("multiDay") && (
            <Button
              variant={selectMode ? "default" : "outline"}
              className="h-10 max-sm:flex-1"
              onClick={onToggleSelectMode}
              aria-pressed={selectMode}
            >
              <CalendarPlus /> Add to several days
            </Button>
          )}
        </div>
      </div>
      <SharePanel
        key={`${open?.n}:${first}:${last}:${projectId}`}
        panel={open?.kind ?? null}
        onClose={() => setOpen(null)}
        defaultFrom={first}
        defaultTo={last}
        projectId={projectId}
      />
    </div>
  );
}
