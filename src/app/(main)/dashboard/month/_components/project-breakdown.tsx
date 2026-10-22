"use client";

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
  const longest = Math.max(1, ...rows.map((x) => x.total));
  return (
    <section
      aria-label="By project"
      data-headerless="a summary list under the dial"
      className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-sheet)]"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="font-mono font-normal text-[11px] text-muted-foreground uppercase tracking-widest">
          By project
        </h2>
        {projectId && (
          <Button size="sm" variant="outline" onClick={() => onProjectId("")}>
            Show all projects
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-muted-foreground text-sm">No time logged this month.</p>
      ) : (
        // One row per project: colour dot, project, a bar for its share, hours. A row filters the page.
        <ul className="divide-y border-t">
          {rows.map((r) => {
            const on = r.projectId === projectId;
            return (
              <li key={r.projectId}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onProjectId(on ? "" : r.projectId)}
                  title={on ? "Show all projects again" : "Show only this project"}
                  className={`flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-muted ${
                    on ? "bg-tint" : projectId ? "text-muted-foreground" : ""
                  }`}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-medium">{r.project}</span>
                    <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${(r.total / longest) * 100}%`, backgroundColor: r.color }}
                      />
                    </span>
                    <span className="sr-only">{r.client}</span>
                  </span>
                  <span className="font-bold font-display text-lg tabular-nums">{formatDuration(r.total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
