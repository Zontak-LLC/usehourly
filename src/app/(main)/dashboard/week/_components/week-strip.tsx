"use client";

import { useEffect, useState } from "react";

import { Dial } from "@/components/day-dial";
import { NoDollar } from "@/components/no-dollar-icon";
import { toggleProjectFilter } from "@/components/project-filter";
import { fromISODate } from "@/lib/dates";
import { dialLeft } from "@/lib/day-dial";
import { formatDecimalHours, formatDuration } from "@/lib/duration";
import type { buildSheet } from "@/lib/timesheet";

const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: "short" });
export const longDayLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

type Sheet = ReturnType<typeof buildSheet>;

/**
 * The week as seven tiles. Pick one and its entries and the add form open below.
 * Seven tiles always share the row (no sideways scrolling). On a phone each is about 52px wide, so the tile is compact there: no side padding, smaller type, and a dot instead of "Today".
 */
export function DayTiles({
  days,
  selected,
  today,
  dayTotals,
  rows,
  nonBillable,
  onPick,
}: {
  days: string[];
  selected: string;
  today: string | null;
  dayTotals: Sheet["dayTotals"];
  /** The week's projects with their minutes per day: each day's tile stacks them as coloured bars. */
  rows: Sheet["rows"];
  /** Dates marked non-billable: the tile carries a small mark and says so to screen readers. */
  nonBillable: ReadonlySet<string>;
  onPick: (d: string) => void;
}) {
  // The bars grow in from nothing on first show (the transition runs once the first frame is painted).
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  // One scale for the week: a day of eight hours (or the busiest day, if longer) fills the bar area.
  const scale = Math.max(480, ...days.map((d) => dayTotals[d] ?? 0));
  return (
    <div role="tablist" aria-label="Days of the week" className="grid grid-cols-7 gap-1 sm:gap-2">
      {days.map((d) => {
        const on = d === selected;
        const total = dayTotals[d] ?? 0;
        const date = fromISODate(d);
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={`${longDayLabel.format(date)}, ${total ? formatDuration(total) : "nothing logged"}${nonBillable.has(d) ? ", non-billable" : ""}`}
            onClick={() => onPick(d)}
            className={`relative flex min-h-36 flex-col items-center justify-end gap-1 rounded-2xl border px-0 py-3 transition-colors sm:min-h-40 sm:px-1 sm:py-3 ${
              on
                ? "border-foreground bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground"
                : d === today
                  ? "border-amber bg-card hover:bg-muted"
                  : "bg-card hover:bg-muted"
            }`}
          >
            {nonBillable.has(d) && <NoDollar className="absolute top-1 right-1 size-3" />}
            <span
              className={`font-medium text-xs uppercase tracking-normal max-sm:text-[0.7rem] sm:tracking-wide ${on ? "text-foreground/75" : "text-muted-foreground"}`}
            >
              {weekdayShort.format(date)}
            </span>
            <span className="font-display font-extrabold text-xl leading-none">{date.getDate()}</span>
            <span aria-hidden="true" className="flex h-14 w-full flex-col-reverse justify-start gap-0.5 px-1 sm:px-2">
              {rows
                .filter((r) => (r.cells[d]?.minutes ?? 0) > 0)
                .map((r) => (
                  <span
                    key={r.projectId}
                    data-dot=""
                    className="block w-full rounded-md"
                    style={{
                      backgroundColor: r.color,
                      height: grown ? `${Math.max(4, ((r.cells[d]?.minutes ?? 0) / scale) * 56)}px` : "0px",
                      transition: "height .8s cubic-bezier(.2,.8,.2,1)",
                    }}
                  />
                ))}
            </span>
            <span
              className={`font-mono text-xs tabular-nums max-sm:text-[0.7rem] sm:text-sm ${total ? "font-medium" : "text-muted-foreground"}`}
            >
              {total ? formatDuration(total) : "–"}
            </span>
            <span
              className={`font-semibold text-foreground/80 text-xs uppercase ${d === today ? "" : "invisible"} max-sm:hidden`}
            >
              Today
            </span>
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full bg-primary sm:hidden ${d === today ? "" : "invisible"}`}
            />
          </button>
        );
      })}
    </div>
  );
}

const WEEK_GOAL_MINUTES = 40 * 60;

/** The week as a dial (hours against a 40-hour week), like the day dial on Today. */
export function WeekDial({ total, today }: { total: number; today: number | null }) {
  return (
    <Dial
      label="This week's hours"
      title="This week"
      minutes={total}
      goal={WEEK_GOAL_MINUTES}
      caption={dialLeft(total, WEEK_GOAL_MINUTES).replace("goal reached", "week full")}
      footLeft={`Goal ${formatDuration(WEEK_GOAL_MINUTES)}`}
      footRight={today !== null ? `Today ${formatDuration(today)}` : undefined}
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
        By project · {formatDecimalHours(sheet.total)} h
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
                        style={{ width: `${(r.total / longest) * 100}%`, backgroundColor: r.color }}
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
