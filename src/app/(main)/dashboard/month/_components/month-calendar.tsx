"use client";

import { NoDollar } from "@/components/no-dollar-icon";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { PALETTE } from "@/lib/palette";
import type { SheetRow } from "@/lib/timesheet";

import type { DaySelection } from "./use-day-selection";
import type { EntryDrag } from "./use-entry-drag";

const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Project dots shown in a cell before "+N" takes over (a cell is small). */
const MAX_DOTS = 3;

type DayProject = { projectId: string; project: string; color: string; minutes: number };

/** The projects worked on each day, biggest first: the cell's small dots. */
function projectsByDay(rows: SheetRow[]): Record<string, DayProject[]> {
  const out: Record<string, DayProject[]> = {};
  for (const r of rows) {
    for (const [d, cell] of Object.entries(r.cells)) {
      if (cell.minutes <= 0) continue;
      const list = out[d] ?? [];
      list.push({ projectId: r.projectId, project: r.project, color: r.color, minutes: cell.minutes });
      out[d] = list;
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.minutes - a.minutes);
  return out;
}

type CellState = {
  inMonth: boolean;
  isToday: boolean;
  isOpen: boolean;
  isWeekend: boolean;
  /** A past weekday of this month with nothing logged. */
  isGap: boolean;
  isPicked: boolean;
  isDropTarget: boolean;
};

function cellClass(s: CellState): string {
  const base =
    "group relative flex min-h-14 cursor-pointer flex-col gap-1 overflow-hidden border-r border-b p-1 text-left transition-colors hover:bg-muted focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 sm:min-h-24 sm:p-2";
  const quiet = !s.inMonth ? "bg-muted/30 text-muted-foreground/70" : s.isWeekend ? "bg-foreground/[0.025]" : "";
  // Only one background at a time (two bg classes would fight over the order in the stylesheet).
  const tone = s.isDropTarget || s.isPicked ? "" : quiet;
  // Amber marks where you are: the open day (and a day an entry is being dragged over) gets an amber ring.
  const ring = s.isOpen || s.isDropTarget ? "z-[1] ring-2 ring-amber ring-inset" : "";
  const drop = s.isDropTarget ? "bg-amber-soft" : "";
  const picked = s.isPicked ? "bg-tint outline-2 outline-primary -outline-offset-2" : "";
  return [base, tone, ring, drop, picked].filter(Boolean).join(" ");
}

function cellLabel(d: string, mins: number, s: CellState, nonBillable: boolean, projects: DayProject[]): string {
  const parts = [`${d}: ${formatDuration(mins)}`];
  if (projects.length) parts.push(projects.map((p) => p.project).join(", "));
  if (s.isGap) parts.push("no time logged");
  if (nonBillable) parts.push("non-billable");
  if (s.isToday) parts.push("today");
  return parts.join(", ");
}

function DayCell({
  d,
  mins,
  max,
  projects,
  state,
  nonBillable,
  selectMode,
  dropHandlers,
  onPointerDown,
  onPointerEnter,
  onClick,
}: {
  d: string;
  mins: number;
  max: number;
  projects: DayProject[];
  state: CellState;
  nonBillable: boolean;
  selectMode: boolean;
  dropHandlers: Partial<React.DOMAttributes<HTMLButtonElement>>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: () => void;
  onClick: () => void;
}) {
  const extra = projects.length - MAX_DOTS;
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onClick={onClick}
      {...dropHandlers}
      aria-pressed={selectMode ? state.isPicked : undefined}
      aria-expanded={selectMode ? undefined : state.isOpen}
      aria-current={state.isToday ? "date" : undefined}
      aria-label={cellLabel(d, mins, state, nonBillable, projects)}
      title={state.isOpen ? "Close this day" : undefined}
      data-drop-target={state.isDropTarget || undefined}
      className={cellClass(state)}
    >
      <span className="flex items-center justify-between gap-1 text-xs">
        {/* Today is a filled amber day number (an outline alone is easy to miss). */}
        <span
          className={
            state.isToday
              ? "inline-flex size-6 items-center justify-center rounded-full bg-amber font-semibold text-neutral-950"
              : `inline-flex h-6 items-center ${state.isWeekend || !state.inMonth ? "text-muted-foreground" : "text-foreground/75"}`
          }
        >
          {Number(d.slice(8))}
        </span>
        {nonBillable && <NoDollar className="size-3" />}
      </span>

      {mins > 0 ? (
        <span className="mt-auto text-right font-display font-extrabold text-foreground text-xs tabular-nums sm:text-lg">
          {formatDuration(mins)}
        </span>
      ) : state.isGap ? (
        // A weekday that went by with nothing logged: a quiet dashed frame (and the words on a wider screen), as on Week.
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-1 rounded-md border border-foreground/15 border-dashed"
          />
          <span className="mt-auto hidden text-right text-muted-foreground text-xs sm:block">No time</span>
        </>
      ) : null}

      {projects.length > 0 && (
        // Which projects: small dots in the client's colour (never a coloured bar). Hidden on a phone, where the cell is narrow.
        <span aria-hidden className="hidden items-center justify-end gap-1 sm:flex">
          {projects.slice(0, MAX_DOTS).map((p) => (
            <span key={p.projectId} className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
          ))}
          {extra > 0 && <span className="text-[10px] text-muted-foreground leading-none">+{extra}</span>}
        </span>
      )}

      {/* How full the day is, against the busiest day of the month: a soft grey line along the foot of the cell. */}
      {mins > 0 && (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-1 rounded-tr-full sm:h-1.5"
          style={{ width: `${Math.max(6, (mins / max) * 100)}%`, backgroundColor: PALETTE.soft }}
        />
      )}
    </button>
  );
}

const weekOf = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function MonthCalendar({
  weeks,
  today,
  dayTotals,
  rows,
  inMonth,
  openDay,
  selectMode,
  rangeSelect,
  selection,
  shownPicked,
  nonBillable,
  drag,
  onOpenDay,
}: {
  weeks: string[][];
  today: string | null;
  dayTotals: Record<string, number>;
  /** The month's project rows (`buildSheet`), for the dots in each day. */
  rows: SheetRow[];
  inMonth: (d: string) => boolean;
  /** The day whose card is open under the calendar. */
  openDay: string | null;
  selectMode: boolean;
  /** Dragging a rectangle of days with the mouse picks them ("Add to several days"); off with that feature. */
  rangeSelect: boolean;
  selection: DaySelection;
  shownPicked: Set<string>;
  /** Dates marked non-billable: the cell carries a small mark. */
  nonBillable: ReadonlySet<string>;
  /** An entry dragged from the open day card: every other day accepts it. */
  drag: EntryDrag;
  /** Opens a day's card, or closes it (null) when that day is already open. */
  onOpenDay: (d: string | null) => void;
}) {
  const { picked, setPicked, drag: rect, setDrag: setRect, suppressClick } = selection;
  const max = Math.max(1, ...Object.values(dayTotals));
  const byDay = projectsByDay(rows);

  const dropHandlers = (d: string): Partial<React.DOMAttributes<HTMLButtonElement>> => {
    const moving = drag.dragged;
    if (!moving || moving.date === d) return {};
    return {
      onDragEnter: (e) => {
        e.preventDefault();
        drag.setOverDay(d);
      },
      onDragOver: (e) => {
        e.preventDefault(); // this is what makes the cell accept the drop
        e.dataTransfer.dropEffect = "move";
        if (drag.overDay !== d) drag.setOverDay(d);
      },
      onDragLeave: (e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (drag.overDay === d) drag.setOverDay(null);
      },
      onDrop: (e) => {
        e.preventDefault();
        drag.dropOn(d);
      },
    };
  };

  return (
    <div className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-sheet)]">
      <div className="grid select-none grid-cols-7 text-sm sm:grid-cols-[repeat(7,minmax(0,1fr))_4.5rem]">
        {[...weekdayNames, "Week"].map((n, i) => (
          <div
            key={n}
            className={`border-b px-0.5 py-2 text-center font-mono text-[11px] uppercase tracking-widest sm:px-2 ${
              n === "Week"
                ? "hidden bg-band-2 text-foreground/75 sm:block"
                : i >= 5
                  ? "text-muted-foreground"
                  : "text-foreground/75"
            }`}
          >
            {n}
          </div>
        ))}
        {weeks.map((w, ri) => {
          const weekTotal = w.reduce((a, d) => a + (inMonth(d) ? (dayTotals[d] ?? 0) : 0), 0);
          return (
            <div key={w[0]} className="contents">
              {w.map((d, ci) => {
                const here = inMonth(d);
                const mins = here ? (dayTotals[d] ?? 0) : 0;
                const isWeekend = ci >= 5;
                const state: CellState = {
                  inMonth: here,
                  isToday: d === today,
                  isOpen: d === openDay,
                  isWeekend,
                  isGap: here && !isWeekend && mins === 0 && !!today && d < today,
                  isPicked: shownPicked.has(d),
                  isDropTarget: drag.overDay === d,
                };
                return (
                  <DayCell
                    key={d}
                    d={d}
                    mins={mins}
                    max={max}
                    projects={here ? (byDay[d] ?? []) : []}
                    state={state}
                    nonBillable={nonBillable.has(d)}
                    selectMode={selectMode}
                    dropHandlers={dropHandlers(d)}
                    onPointerDown={(e) => {
                      if (!rangeSelect || e.pointerType !== "mouse" || e.button !== 0) return;
                      suppressClick.current = false;
                      setRect({
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
                      if (!rect || (rect.r1 === ri && rect.c1 === ci)) return;
                      setRect({ ...rect, r1: ri, c1: ci, moved: rect.moved || ri !== rect.r0 || ci !== rect.c0 });
                    }}
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      if (!selectMode) return onOpenDay(d === openDay ? null : d);
                      if (!here) return;
                      setPicked((prev) => {
                        const next = new Set(prev);
                        next.has(d) ? next.delete(d) : next.add(d);
                        return next;
                      });
                    }}
                  />
                );
              })}
              {/* The week's total (this month's days only), at the end of its row. */}
              <div className="hidden flex-col items-end justify-end border-b bg-band-2 p-2 sm:flex">
                <span className="sr-only">Week of {weekOf.format(fromISODate(w[0]))}: </span>
                <span className="font-bold font-display text-base text-foreground tabular-nums">
                  {weekTotal ? formatDuration(weekTotal) : <span className="text-muted-foreground">0:00</span>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
