"use client";

import { useState } from "react";

import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";

import { ProjectFilter } from "@/components/project-filter";
import { ShareExportMenu, SharePanel, type SharePanelKind } from "@/components/share-export-menu";
import { Button } from "@/components/ui/button";
import { addMonths } from "@/lib/dates";
import type { SheetEntry } from "@/lib/timesheet";

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
      <div
        data-testid="timesheet-toolbar"
        className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap sm:*:min-w-0 sm:*:flex-1"
      >
        <ProjectFilter className="h-10 max-sm:flex-1" value={projectId} onChange={onProjectId} />
        <ShareExportMenu
          className="h-10 max-sm:flex-1"
          entries={shown}
          days={monthDays}
          filename={`usehourly-${first.slice(0, 7)}.xlsx`}
          period="month"
          onPanel={choose}
        />
        <Button
          variant={selectMode ? "default" : "outline"}
          className="h-10 max-sm:flex-1"
          onClick={onToggleSelectMode}
          aria-pressed={selectMode}
        >
          <CalendarPlus /> Add to several days
        </Button>
        <div className="flex items-center overflow-hidden rounded-lg border bg-card max-sm:w-full sm:min-w-44">
          <Button
            size="icon"
            variant="ghost"
            className="size-10 rounded-none"
            onClick={() => onFirst(addMonths(first, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            className="h-10 flex-1 rounded-none border-x disabled:font-semibold disabled:opacity-100"
            // Already showing this month: nothing to go back to (like the Today button on the Today page). It stays fully
            // readable, because it says where you are, instead of fading like a broken control.
            disabled={!today || first === `${today.slice(0, 7)}-01`}
            aria-current={today && first === `${today.slice(0, 7)}-01` ? "date" : undefined}
            onClick={() => today && onFirst(`${today.slice(0, 7)}-01`)}
          >
            This month
          </Button>
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
