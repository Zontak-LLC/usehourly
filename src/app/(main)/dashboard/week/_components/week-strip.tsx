"use client";

import { toggleProjectFilter } from "@/components/project-filter";
import { fromISODate } from "@/lib/dates";
import { formatDecimalHours, formatDuration } from "@/lib/duration";
import type { buildSheet } from "@/lib/timesheet";

const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: "short" });
export const longDayLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

type Sheet = ReturnType<typeof buildSheet>;

/** The week as seven tiles. Pick one and its entries and the add form open below. */
export function DayTiles({
  days,
  selected,
  today,
  dayTotals,
  onPick,
}: {
  days: string[];
  selected: string;
  today: string | null;
  dayTotals: Sheet["dayTotals"];
  onPick: (d: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Days of the week" className="grid grid-cols-7 gap-1.5 sm:gap-2">
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
            aria-label={`${longDayLabel.format(date)}, ${total ? formatDuration(total) : "nothing logged"}`}
            onClick={() => onPick(d)}
            className={`flex min-h-24 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-3 transition-colors ${
              on
                ? "border-primary bg-primary/15 shadow-sm ring-2 ring-primary/40"
                : d === today
                  ? "border-primary/50 bg-card hover:bg-muted"
                  : "bg-card hover:bg-muted"
            } ${[0, 6].includes(date.getDay()) && !on ? "bg-muted/40" : ""}`}
          >
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {weekdayShort.format(date)}
            </span>
            <span className="font-semibold text-xl leading-none">{date.getDate()}</span>
            <span
              className={`font-mono text-xs tabular-nums sm:text-sm ${total ? "font-medium" : "text-muted-foreground"}`}
            >
              {total ? formatDuration(total) : "–"}
            </span>
            <span className={`text-[10px] text-primary uppercase ${d === today ? "" : "invisible"}`}>Today</span>
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
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-baseline justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
        <h2 className="font-semibold text-base">This week</h2>
        <span className="font-semibold font-mono text-lg tabular-nums">
          {formatDuration(sheet.total)}
          <span className="ml-1 font-normal text-muted-foreground text-xs">({formatDecimalHours(sheet.total)} h)</span>
        </span>
      </div>
      {sheet.rows.length > 0 && (
        <ul className="flex flex-wrap gap-2 p-4">
          {sheet.rows.map((r) => {
            const on = projectId === r.projectId;
            return (
              <li key={r.projectId}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onProjectId(toggleProjectFilter(projectId, r.projectId))}
                  title={on ? "Show all projects" : `Show only ${r.project}`}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-muted ${
                    on ? "border-primary bg-primary/10" : ""
                  }`}
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="font-medium">{r.project}</span>
                  <span className="text-muted-foreground">· {r.client}</span>
                  <span className="font-mono tabular-nums">{formatDuration(r.total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
