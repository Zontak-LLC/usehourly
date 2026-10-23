"use client";

import { useEffect, useRef } from "react";

import { NoDollar } from "@/components/no-dollar-icon";
import { useRoll } from "@/components/time-reward";
import { addDays, fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";

type Entry = { date: string; minutes: number };

const dayName = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const fullDay = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

/**
 * A day's hours: when time is added they count up with a small pop (part of the reward for logging; none with reduce
 * motion). Only real new time counts: `dayTotal` is the day's time across every project, so changing Week's project
 * filter (which changes `minutes`) never plays it.
 */
function DayHours({ minutes, dayTotal, gap }: { minutes: number; dayTotal: number; gap: boolean }) {
  const before = useRef({ minutes, dayTotal });
  const { shown, roll } = useRoll(600);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs only when the time changes; `roll` is a fresh function each render
  useEffect(() => {
    const was = before.current;
    if (dayTotal > was.dayTotal && minutes > was.minutes) roll(was.minutes, minutes);
    before.current = { minutes, dayTotal };
  }, [minutes, dayTotal]);
  const value = shown ?? minutes;
  return (
    <span
      className={`font-mono text-[11px] tabular-nums transition-transform duration-300 ${
        shown !== null ? "scale-125 font-semibold text-foreground" : "text-foreground/80"
      }`}
    >
      {value ? formatDuration(value) : gap ? "No time" : "–"}
    </span>
  );
}

/**
 * The week as one slim row of seven day buttons: the day, its date, the hours and a thin bar for how full it was. The
 * day shown is pressed (an amber ring, like the open tab); today has an amber dot; a past weekday with nothing logged shows as a dashed gap ("No time").
 * Tapping a day opens it. Week's own control (Today walks one day at a time with its day stepper).
 */
export function WeekPills({
  entries,
  weekStart,
  date,
  today,
  onPick,
  goal = 480,
  nonBillable,
  allEntries,
}: {
  entries: Entry[];
  weekStart: string;
  date: string;
  today: string | null;
  onPick: (d: string) => void;
  goal?: number;
  /** Dates marked non-billable: a small mark, and they never count as a gap. */
  nonBillable?: ReadonlySet<string>;
  /** Every entry of the week when `entries` is filtered (by a project): a day is only a gap when it is really empty. */
  allEntries?: Entry[];
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const sumDay = (list: Entry[], d: string) => list.filter((e) => e.date === d).reduce((s, e) => s + e.minutes, 0);
  const perDay = (d: string) => sumDay(entries, d);
  return (
    <nav aria-label="This week" className="grid grid-cols-7 gap-1.5">
      {days.map((d) => {
        const minutes = perDay(d);
        const picked = d === date;
        const when = fromISODate(d);
        // A past weekday with nothing logged is a gap: the thing a weekly timesheet is for spotting.
        const weekday = when.getDay() !== 0 && when.getDay() !== 6;
        const gap = !sumDay(allEntries ?? entries, d) && weekday && !!today && d < today && !nonBillable?.has(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onPick(d)}
            aria-current={picked ? "date" : undefined}
            aria-label={`${fullDay.format(when)}, ${minutes ? formatDuration(minutes) : "nothing logged"}${nonBillable?.has(d) ? ", non-billable" : ""}`}
            className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl bg-card px-1 py-2 ring-1 transition-colors ${
              picked
                ? "bg-card ring-2 ring-amber"
                : gap
                  ? "border border-foreground/30 border-dashed bg-transparent ring-0 hover:bg-card"
                  : "ring-foreground/10 hover:ring-foreground/30"
            }`}
          >
            {d === today && <span aria-hidden className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-amber" />}
            {nonBillable?.has(d) && <NoDollar className="absolute top-1 left-1 size-3" />}
            <span className="font-mono text-[10px] text-foreground/70 uppercase tracking-wider">
              {dayName.format(when)}
            </span>
            <span className="font-display font-extrabold text-lg leading-none">{when.getDate()}</span>
            <DayHours minutes={minutes} dayTotal={sumDay(allEntries ?? entries, d)} gap={gap} />
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-muted">
              <span
                className="block h-full bg-foreground/40 transition-[width] duration-700"
                style={{ width: `${Math.min(100, (minutes / goal) * 100)}%` }}
              />
            </span>
          </button>
        );
      })}
    </nav>
  );
}
