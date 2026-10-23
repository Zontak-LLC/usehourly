"use client";

import { DigitalWatch } from "@/components/digital-watch";
import { toggleProjectFilter } from "@/components/project-filter";
import { formatDuration } from "@/lib/duration";
import type { buildSheet } from "@/lib/timesheet";

export const longDayLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

type Sheet = ReturnType<typeof buildSheet>;

const WEEK_GOAL_MINUTES = 40 * 60;

/** The Week page's clock: the D-1 digital watch telling the time, with the week's hours under it and along its foot. */
export function WeekDial({ total }: { total: number }) {
  return (
    <DigitalWatch
      label="The time now"
      mode={{ kind: "time" }}
      foot={`${formatDuration(total)} of ${formatDuration(WEEK_GOAL_MINUTES)} this week`}
      progress={total / WEEK_GOAL_MINUTES}
    />
  );
}

/** One row per project: a sheet under the dial; a row filters the whole page when pressed. */
export function WeekTotalCard({
  sheet,
  projectId,
  onProjectId,
}: {
  sheet: Sheet;
  projectId: string;
  onProjectId: (id: string) => void;
}) {
  const longest = Math.max(1, ...sheet.rows.map((x) => x.total));
  return (
    <section
      aria-label="This week"
      data-headerless="a summary list under the dial"
      className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-sheet)]"
    >
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
