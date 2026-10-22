"use client";

import { Ban, Clock } from "lucide-react";

import { toggleProjectFilter } from "@/components/project-filter";
import { fromISODate } from "@/lib/dates";
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
  dots,
  nonBillable,
  onPick,
}: {
  days: string[];
  selected: string;
  today: string | null;
  dayTotals: Sheet["dayTotals"];
  /** Client colours per day (see lib/week-dots.ts): a dot for each client with time that day, none for an empty day. */
  dots: Record<string, string[]>;
  /** Dates marked non-billable: the tile carries a small mark and says so to screen readers. */
  nonBillable: ReadonlySet<string>;
  onPick: (d: string) => void;
}) {
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
            className={`relative flex min-h-20 flex-col items-center justify-center gap-0.5 rounded-xl border px-0 py-3 transition-colors sm:min-h-24 sm:px-1 sm:py-3 ${
              on
                ? "border-primary bg-tint shadow-sm ring-2 ring-primary/40"
                : d === today
                  ? "border-primary/50 bg-card hover:bg-muted"
                  : "bg-card hover:bg-muted"
            }`}
          >
            {nonBillable.has(d) && <Ban className="absolute top-1 right-1 size-3" aria-hidden />}
            <span
              className={`font-medium text-xs uppercase tracking-normal max-sm:text-[0.7rem] sm:tracking-wide ${on ? "text-foreground/75" : "text-muted-foreground"}`}
            >
              {weekdayShort.format(date)}
            </span>
            <span className="font-semibold text-xl leading-none">{date.getDate()}</span>
            <span
              className={`font-mono text-xs tabular-nums max-sm:text-[0.7rem] sm:text-sm ${total ? "font-medium" : "text-muted-foreground"}`}
            >
              {total ? formatDuration(total) : "–"}
            </span>
            <span aria-hidden="true" className="flex h-1.5 items-center gap-0.5">
              {(dots[d] ?? []).map((color, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: at most three dots that never reorder
                  key={i}
                  data-dot=""
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
              ))}
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

/** The week's total, with one pill per project that filters the page when clicked. */
export function WeekTotalCard({
  sheet,
  projectId,
  onProjectId,
}: {
  sheet: Sheet;
  projectId: string;
  onProjectId: (id: string) => void;
}) {
  return (
    <section
      aria-label="This week"
      data-headerless="a summary strip with its big figure first"
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
    >
      {/* A summary, not another card: no frame and no header, a big figure first, then the projects that made it up. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-medium text-foreground/75 text-sm">Total hours this week</h2>
        <p className="font-mono font-semibold text-3xl tabular-nums leading-none">{formatDuration(sheet.total)}</p>
        <p className="text-foreground/75 text-sm">({formatDecimalHours(sheet.total)} h)</p>
      </div>
      {sheet.rows.length > 0 && (
        // One row per project, full width inside the card: dot, project and client, hours. A row filters the week.
        <ul className="-mx-4 -mb-4 divide-y border-t">
          {sheet.rows.map((r) => {
            const on = projectId === r.projectId;
            return (
              <li key={r.projectId}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onProjectId(toggleProjectFilter(projectId, r.projectId))}
                  title={on ? "Show all projects" : `Show only ${r.project}`}
                  className={`flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-muted ${
                    on ? "bg-tint" : projectId ? "text-muted-foreground" : ""
                  }`}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.project}</span>
                    <span className="block truncate text-muted-foreground text-xs">{r.client}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 font-mono tabular-nums">
                    <Clock className="size-3.5" aria-hidden />
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
