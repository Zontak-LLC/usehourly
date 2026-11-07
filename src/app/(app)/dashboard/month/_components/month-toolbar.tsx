"use client";

import { useState } from "react";

import { CalendarPlus } from "lucide-react";

import { ProjectFilter } from "@/components/project-filter";
import { ShareExportMenu, SharePanel, type SharePanelKind } from "@/components/share-export-menu";
import { Button } from "@/components/ui/button";
import { feature } from "@/lib/features";
import type { SheetEntry } from "@/lib/timesheet";

export function MonthToolbar({
  first,
  last,
  monthDays,
  shown,
  selectMode,
  projectId,
  onToggleSelectMode,
  onProjectId,
}: {
  first: string;
  last: string;
  monthDays: string[];
  /** The month's entries after the project filter; undefined while still loading. */
  shown: SheetEntry[] | undefined;
  selectMode: boolean;
  projectId: string;
  onToggleSelectMode: () => void;
  onProjectId: (id: string) => void;
}) {
  const [open, setOpen] = useState<{ kind: SharePanelKind; n: number } | null>(null);
  // A new menu choice (even the same one again) starts the form fresh; so does moving to another period or project.
  const choose = (kind: SharePanelKind) => setOpen((o) => ({ kind, n: (o?.n ?? 0) + 1 }));
  return (
    <div className="flex w-full flex-col gap-3">
      {/* The filter and Export, at the end of the row; moving between months sits above the calendar (one place only). */}
      <div data-testid="timesheet-toolbar" className="flex w-full flex-wrap items-center justify-end gap-2">
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
