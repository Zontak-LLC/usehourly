"use client";

import { HeaderCard } from "@/components/header-card";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/duration";
import type { buildSheet } from "@/lib/timesheet";

const COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

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
        // No lonely tile in the last row: up to four projects share one row on a wide screen.
        <div className={`grid gap-3 sm:grid-cols-2 ${COLS[Math.min(rows.length, 4)] ?? "lg:grid-cols-3"}`}>
          {rows.map((r) => {
            const on = r.projectId === projectId;
            return (
              <button
                key={r.projectId}
                type="button"
                aria-pressed={on}
                onClick={() => onProjectId(on ? "" : r.projectId)}
                title={on ? "Show all projects again" : "Show only this project"}
                className={`flex min-h-20 flex-col justify-between gap-2 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted ${
                  on ? "border-primary bg-tint" : projectId ? "text-muted-foreground" : ""
                }`}
              >
                <span className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.project}</span>
                    <span className="block truncate text-muted-foreground text-xs">{r.client}</span>
                  </span>
                </span>
                {/* One figure: the hours and minutes (the decimal says the same thing a second time). */}
                <span className="font-mono font-semibold text-lg tabular-nums">{formatDuration(r.total)}</span>
              </button>
            );
          })}
        </div>
      )}
    </HeaderCard>
  );
}
