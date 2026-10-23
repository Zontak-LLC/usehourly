"use client";

import { toggleProjectFilter } from "@/components/project-filter";
import { formatDuration } from "@/lib/duration";
import { PALETTE } from "@/lib/palette";
import type { buildSheet } from "@/lib/timesheet";

export const longDayLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

type Sheet = ReturnType<typeof buildSheet>;

const WEEK_GOAL_MINUTES = 40 * 60;

/**
 * The week at a glance: the hours against a 40-hour week as one progress line (it replaced the clock on 2026-10-23: the
 * clock told the time of day and the date of today, not of the week shown), then one row per project; a row filters
 * the whole page when pressed.
 */
export function WeekTotalCard({
  sheet,
  weekMinutes,
  projectId,
  onProjectId,
}: {
  sheet: Sheet;
  /** The whole week, whatever project is picked: the line measures the week, the rows below follow the filter. */
  weekMinutes: number;
  projectId: string;
  onProjectId: (id: string) => void;
}) {
  const longest = Math.max(1, ...sheet.rows.map((x) => x.total));
  return (
    <section
      aria-label="This week"
      data-headerless="a summary list beside the day"
      className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-sheet)]"
    >
      <div className="px-4 pt-4">
        <p className="text-sm">
          <span className="font-bold font-display text-2xl tabular-nums">{formatDuration(weekMinutes)}</span>{" "}
          <span className="text-muted-foreground">of {formatDuration(WEEK_GOAL_MINUTES)} this week</span>
        </p>
        <div
          role="progressbar"
          aria-label="Hours this week, out of 40"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(1, weekMinutes / WEEK_GOAL_MINUTES) * 100)}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{
              width: `${Math.min(1, weekMinutes / WEEK_GOAL_MINUTES) * 100}%`,
              background: `linear-gradient(90deg, ${PALETTE.brandBlend.join(", ")})`,
            }}
          />
        </div>
      </div>
      <h2 className="px-4 pt-4 pb-2 font-mono font-normal text-[11px] text-muted-foreground uppercase tracking-widest">
        By project · {formatDuration(sheet.total)}
      </h2>
      {sheet.rows.length === 0 ? (
        <p className="px-4 pb-4 text-muted-foreground text-sm">Nothing logged this week yet.</p>
      ) : (
        <ul className="divide-y border-t">
          {sheet.rows.map((r) => {
            const on = projectId === r.projectId;
            return (
              <li key={r.projectId}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onProjectId(toggleProjectFilter(projectId, r.projectId))}
                  title={on ? "Show all projects" : `Show only ${r.project}`}
                  className={`flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-muted ${
                    on ? "bg-tint" : projectId ? "text-muted-foreground" : ""
                  }`}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.project}</span>
                    <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(r.total / longest) * 100}%`,
                          backgroundColor: "color-mix(in oklab, var(--foreground) 38%, transparent)",
                        }}
                      />
                    </span>
                    <span className="sr-only">{r.client}</span>
                  </span>
                  <span className="shrink-0 font-bold font-display text-lg tabular-nums">
                    {formatDuration(r.total)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
