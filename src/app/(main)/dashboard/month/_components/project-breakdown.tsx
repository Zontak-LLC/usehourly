"use client";

import { HeaderCard } from "@/components/header-card";
import { Button } from "@/components/ui/button";
import { formatDecimalHours, formatDuration } from "@/lib/duration";
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                <span className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
                  <span className="font-semibold text-lg">{formatDuration(r.total)}</span>
                  <span className="text-muted-foreground text-xs">{formatDecimalHours(r.total)} h</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </HeaderCard>
  );
}
