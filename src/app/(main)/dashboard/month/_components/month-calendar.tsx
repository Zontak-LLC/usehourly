"use client";

import { NoDollar } from "@/components/no-dollar-icon";
import { DAY_COLORS, TODAY_COLOR } from "@/lib/day-colors";
import { formatDuration } from "@/lib/duration";

import type { DaySelection } from "./use-day-selection";

const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DayCell({
  d,
  color,
  mins,
  max,
  inMonth,
  isToday,
  nonBillable,
  selectMode,
  isPicked,
  onPointerDown,
  onPointerEnter,
  onClick,
}: {
  d: string;
  /** The colour of this weekday (the same seven as the Today week bars). */
  color: string;
  mins: number;
  max: number;
  inMonth: boolean;
  isToday: boolean;
  nonBillable: boolean;
  selectMode: boolean;
  isPicked: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onClick={onClick}
      aria-pressed={selectMode ? isPicked : undefined}
      aria-label={`${d}: ${formatDuration(mins)}${nonBillable ? ", non-billable" : ""}`}
      className={`relative flex min-h-16 cursor-pointer flex-col justify-between overflow-hidden border-r border-b p-1 text-left transition-colors hover:bg-muted sm:min-h-20 sm:p-2 ${
        inMonth ? "" : "bg-muted/30 text-muted-foreground"
      } ${isToday ? "ring-2 ring-inset" : ""} ${isPicked ? "bg-tint outline-2 outline-primary -outline-offset-2" : ""}`}
      style={isToday ? { ["--tw-ring-color" as string]: TODAY_COLOR } : undefined}
    >
      <span className="flex items-center justify-between text-xs">
        {/* Today is a filled day number (an outline alone is easy to miss). */}
        <span
          className={
            isToday ? "inline-flex size-6 items-center justify-center rounded-full font-semibold text-[#1b1405]" : ""
          }
          style={isToday ? { backgroundColor: TODAY_COLOR } : undefined}
        >
          {Number(d.slice(8))}
        </span>
        {nonBillable && <NoDollar className="size-3" />}
      </span>
      <span className="text-right font-medium font-mono text-foreground text-xs tabular-nums sm:text-sm">
        {mins ? formatDuration(mins) : ""}
      </span>
      {/* How full the day is, against the busiest day of the month: a thin bar in the weekday's colour along the foot of the cell. */}
      {mins > 0 && (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-1.5 rounded-tr-full"
          style={{ width: `${Math.max(6, (mins / max) * 100)}%`, backgroundColor: color }}
        />
      )}
    </button>
  );
}

export function MonthCalendar({
  weeks,
  today,
  dayTotals,
  inMonth,
  selectMode,
  selection,
  shownPicked,
  nonBillable,
  onOpenDay,
}: {
  weeks: string[][];
  today: string | null;
  dayTotals: Record<string, number>;
  inMonth: (d: string) => boolean;
  selectMode: boolean;
  selection: DaySelection;
  shownPicked: Set<string>;
  /** Dates marked non-billable: the cell carries a small mark. */
  nonBillable: ReadonlySet<string>;
  onOpenDay: (d: string) => void;
}) {
  const { picked, setPicked, drag, setDrag, suppressClick } = selection;
  const max = Math.max(1, ...Object.values(dayTotals));

  return (
    <div className="overflow-x-auto rounded-3xl border bg-card shadow-[var(--shadow-sheet)]">
      <div className="grid select-none grid-cols-7 text-sm xl:grid-cols-[repeat(7,minmax(0,1fr))_5.5rem]">
        {[...weekdayNames, "Week"].map((n) => (
          <div
            key={n}
            className={`border-b px-0.5 py-2 text-center text-muted-foreground text-xs sm:px-2 ${n === "Week" ? "hidden xl:block" : ""}`}
          >
            {n}
          </div>
        ))}
        {weeks.map((w, ri) => {
          const weekTotal = w.reduce((a, d) => a + (inMonth(d) ? (dayTotals[d] ?? 0) : 0), 0);
          return (
            <div key={w[0]} className="contents">
              {w.map((d, ci) => (
                <DayCell
                  key={d}
                  d={d}
                  color={DAY_COLORS[ci % 7]}
                  mins={inMonth(d) ? (dayTotals[d] ?? 0) : 0}
                  max={max}
                  inMonth={inMonth(d)}
                  isToday={d === today}
                  nonBillable={nonBillable.has(d)}
                  selectMode={selectMode}
                  isPicked={shownPicked.has(d)}
                  onPointerDown={(e) => {
                    if (e.pointerType !== "mouse" || e.button !== 0) return;
                    suppressClick.current = false;
                    setDrag({
                      r0: ri,
                      c0: ci,
                      r1: ri,
                      c1: ci,
                      additive: e.ctrlKey || e.metaKey || e.shiftKey,
                      base: new Set(picked),
                      moved: false,
                    });
                  }}
                  onPointerEnter={() => {
                    if (!drag || (drag.r1 === ri && drag.c1 === ci)) return;
                    setDrag({
                      ...drag,
                      r1: ri,
                      c1: ci,
                      moved: drag.moved || ri !== drag.r0 || ci !== drag.c0,
                    });
                  }}
                  onClick={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    if (!selectMode) return onOpenDay(d);
                    if (!inMonth(d)) return;
                    setPicked((prev) => {
                      const next = new Set(prev);
                      next.has(d) ? next.delete(d) : next.add(d);
                      return next;
                    });
                  }}
                />
              ))}
              <div className="hidden items-end justify-end border-b bg-band-2 p-2 font-bold font-display text-foreground tabular-nums xl:flex">
                {weekTotal ? formatDuration(weekTotal) : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
