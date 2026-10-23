"use client";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { DayPicker } from "@/components/day-picker";
import { useSweepIn } from "@/components/use-sweep-in";
import { addDays, fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { PALETTE } from "@/lib/palette";

const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const full = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const shortFull = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

/** "Yesterday", "3 days ago", "Tomorrow", "In 2 days": where the day shown sits from today. */
function relative(date: string, today: string | null) {
  if (!today) return "Day";
  const days = Math.round((fromISODate(date).getTime() - fromISODate(today).getTime()) / 86_400_000);
  if (days === -1) return "Yesterday";
  if (days === 1) return "Tomorrow";
  return days < 0 ? `${-days} days ago` : `In ${days} days`;
}

/** The day before or after: as big as one of Week's tiles, with its date and hours, so you see where a tap goes. */
function Neighbour({
  day,
  minutes,
  isToday,
  direction,
  onPick,
}: {
  day: string;
  minutes: number;
  isToday: boolean;
  direction: "previous" | "next";
  onPick: (d: string) => void;
}) {
  const when = fromISODate(day);
  const Arrow = direction === "previous" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={() => onPick(day)}
      aria-label={`${direction === "previous" ? "Previous day" : "Next day"}: ${full.format(when)}, ${minutes ? formatDuration(minutes) : "nothing logged"}`}
      className="group relative flex min-h-20 items-center justify-center gap-1 rounded-xl bg-card px-1 ring-1 ring-foreground/10 transition-colors hover:ring-foreground/30"
    >
      {direction === "previous" && (
        <Arrow aria-hidden className="size-5 text-foreground/50 transition-transform group-hover:-translate-x-0.5" />
      )}
      <span className="flex flex-col items-center gap-0.5">
        <span className="font-mono text-[10px] text-foreground/70 uppercase tracking-wider">
          {isToday ? "Today" : weekday.format(when)}
        </span>
        {/* The same drawing as Week's tiles and Month's cells: a quiet date, the hours the stronger figure. */}
        <span
          className={
            isToday
              ? "inline-flex size-6 items-center justify-center rounded-full bg-amber font-semibold text-neutral-950 text-sm"
              : "inline-flex h-6 items-center font-medium text-foreground/75 text-sm"
          }
        >
          {when.getDate()}
        </span>
        <span
          className={`font-mono tabular-nums tracking-tight ${minutes ? "font-semibold text-foreground/90 text-sm" : "text-foreground/50 text-xs"}`}
        >
          {minutes ? formatDuration(minutes) : "–"}
        </span>
      </span>
      {direction === "next" && (
        <Arrow aria-hidden className="size-5 text-foreground/50 transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  );
}

/** A working day, for the progress line under the day's name. */
const DAY_GOAL_MINUTES = 480;

/**
 * Today's own way of moving, "the day card" (2026-10-23, direction A of the five designs): ONE card on top of the page.
 * Inside it, the day shown is the big ringed tile (amber when it is today, ink otherwise) (its name, a progress line toward 8 hours, the day's and week's
 * totals; a tap opens the month calendar), with the day before and the day after beside it as big buttons; the card's
 * footer holds the timer and the days with no time. Month has its calendar, Week its seven tiles; Today is about a
 * single day, so it walks one day at a time.
 */
export function DayCard({
  date,
  today,
  minutesOn,
  dayTotal,
  weekTotal,
  onPick,
  footer,
}: {
  date: string;
  today: string | null;
  /** Minutes logged on a date (the neighbours). */
  minutesOn: (d: string) => number;
  dayTotal: number;
  weekTotal: number | null;
  onPick: (d: string) => void;
  /** The timer and the days with no time, under the days. */
  footer?: React.ReactNode;
}) {
  const shown = useSweepIn(Math.min(1, dayTotal / DAY_GOAL_MINUTES));
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const when = fromISODate(date);
  return (
    <section
      aria-label="This day"
      className="rounded-2xl bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10"
    >
      <nav
        aria-label="Days"
        className="grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,1fr)] gap-1.5 p-2 sm:gap-2"
      >
        <Neighbour day={prev} minutes={minutesOn(prev)} isToday={prev === today} direction="previous" onPick={onPick} />
        <DayPicker
          date={date}
          today={today}
          onPick={onPick}
          className={`flex min-h-20 min-w-0 flex-col items-center justify-center gap-1 rounded-xl bg-card px-2 py-2 ring-2 transition-shadow hover:shadow-md ${
            date === today ? "ring-amber" : "ring-foreground"
          }`}
        >
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-foreground/70 uppercase tracking-wider">
            {date === today ? (
              <>
                <span aria-hidden className="size-1.5 rounded-full bg-amber" /> Today
              </>
            ) : (
              relative(date, today)
            )}
          </span>
          <span className="group/date flex min-w-0 items-center gap-1.5 font-display font-semibold text-base leading-tight sm:text-lg">
            <span className="truncate sm:hidden">{shortFull.format(when)}</span>
            <span className="truncate max-sm:hidden">{full.format(when)}</span>
            <CalendarDays aria-hidden className="size-4 shrink-0 text-foreground/40" />
            <ChevronDown aria-hidden className="-ml-1 size-3.5 shrink-0 text-foreground/40" />
          </span>
          {/* Nothing logged yet: no empty track and no "0:00", just words. */}
          {dayTotal > 0 && (
            <span
              role="progressbar"
              aria-label="This day: progress towards 8 hours"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(1, dayTotal / DAY_GOAL_MINUTES) * 100)}
              className="block h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-foreground/10"
            >
              <span
                className="block h-full rounded-full transition-[width] duration-1000 ease-out"
                style={{
                  width: `${shown * 100}%`,
                  background: `linear-gradient(90deg, ${PALETTE.brandBlend.join(", ")})`,
                }}
              />
            </span>
          )}
          <span className="font-mono text-[13px] text-foreground/70 tabular-nums">
            {dayTotal > 0 ? (
              <>
                <span className="font-semibold text-foreground">{formatDuration(dayTotal)}</span> this day
              </>
            ) : (
              "Nothing yet"
            )}
            {weekTotal !== null && <> · {formatDuration(weekTotal)} this week</>}
          </span>
        </DayPicker>
        <Neighbour day={next} minutes={minutesOn(next)} isToday={next === today} direction="next" onPick={onPick} />
      </nav>
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-foreground/10 border-t px-3 py-2.5">
          {footer}
        </div>
      )}
    </section>
  );
}
