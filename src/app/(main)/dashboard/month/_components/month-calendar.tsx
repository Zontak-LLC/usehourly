"use client";

import { Ban } from "lucide-react";

import { formatDuration } from "@/lib/duration";

import type { DaySelection } from "./use-day-selection";

const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DayCell({
  d,
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
      className={`flex min-h-16 cursor-pointer flex-col justify-between border-r border-b p-1 text-left transition-colors hover:bg-muted sm:min-h-20 sm:p-2 ${
        inMonth ? "" : "bg-muted/30 text-muted-foreground"
      } ${isToday ? "ring-2 ring-primary ring-inset" : ""} ${
        isPicked ? "bg-primary/15 outline-2 outline-primary -outline-offset-2" : ""
      }`}
      style={
        mins
          ? {
              backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round((mins / max) * 28) + 6}%, transparent)`,
            }
          : undefined
      }
    >
      <span className="flex items-center justify-between text-xs">
        {Number(d.slice(8))}
        {nonBillable && <Ban className="size-3" aria-hidden />}
      </span>
      <span className="text-right font-mono text-xs tabular-nums sm:text-sm">{mins ? formatDuration(mins) : ""}</span>
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
    <div className="overflow-x-auto rounded-xl border bg-card">
      <div className="grid select-none grid-cols-7 text-sm sm:min-w-[680px] sm:grid-cols-[repeat(7,minmax(0,1fr))_5.5rem]">
        {[...weekdayNames, "Week"].map((n) => (
          <div
            key={n}
            className={`border-b px-0.5 py-2 text-center text-muted-foreground text-xs sm:px-2 ${n === "Week" ? "hidden sm:block" : ""}`}
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
              <div className="hidden items-end justify-end border-b bg-muted/40 p-2 font-medium font-mono tabular-nums sm:flex">
                {weekTotal ? formatDuration(weekTotal) : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
