"use client";

import { HeaderCard } from "@/components/header-card";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/duration";
import type { buildSheet } from "@/lib/timesheet";

export function ProjectBreakdown({
  rows,
  projectId,
  onProjectId,
}: {
  rows: ReturnType<typeof buildSheet>["rows"];
  projectId: string;
  onProjectId: (id: string) => void;
}) {
  return (
    <HeaderCard
      label="By project"
      header={
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-base">By project</h2>
          {projectId && (
            <Button size="sm" variant="outline" onClick={() => onProjectId("")}>
              Show all projects
            </Button>
          )}
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="py-4 text-center text-muted-foreground text-sm">No time logged this month.</p>
      ) : (
        // One row per project (cards group, rows list): colour dot, project and client, hours. A row filters the page.
        <ul className="-m-3 divide-y sm:-m-4">
          {rows.map((r) => {
            const on = r.projectId === projectId;
            return (
              <li key={r.projectId}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onProjectId(on ? "" : r.projectId)}
                  title={on ? "Show all projects again" : "Show only this project"}
                  className={`flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted sm:px-4 ${
                    on ? "bg-tint" : projectId ? "text-muted-foreground" : ""
                  }`}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-medium">{r.project}</span>
                    <span className="block truncate text-muted-foreground text-xs">{r.client}</span>
                  </span>
                  {/* One figure: the hours and minutes (the decimal says the same thing a second time). */}
                  <span className="font-mono font-semibold text-lg tabular-nums">{formatDuration(r.total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </HeaderCard>
  );
}
