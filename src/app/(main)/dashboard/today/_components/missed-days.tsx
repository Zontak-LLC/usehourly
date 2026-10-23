"use client";

import { CalendarX } from "lucide-react";

import { fromISODate } from "@/lib/dates";
import { MISSED_SHOWN } from "@/lib/day-nav";

const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
/** "Mon 19": the weekday first, whatever order the browser's language uses for the two together. */
const short = (d: Date) => `${weekday.format(d)} ${d.getDate()}`;
const full = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

/**
 * Recent weekdays with no time, as small buttons that open the day ("missed days", 2026-10-23). It replaced the week
 * row on Today: Week shows the whole week, Today only points at the gaps. Nothing shows when there are none.
 */
export function MissedDays({ days, date, onPick }: { days: string[]; date: string; onPick: (d: string) => void }) {
  const others = days.filter((d) => d !== date);
  if (others.length === 0) return null;
  const shown = others.slice(-MISSED_SHOWN); // the most recent ones
  const more = others.length - shown.length;
  return (
    <nav aria-label="Days with no time" className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="inline-flex items-center gap-1.5 text-foreground/75">
        <CalendarX aria-hidden className="size-3.5" />
        No time:
      </span>
      {shown.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onPick(d)}
          aria-label={`${full.format(fromISODate(d))}: no time logged, open it`}
          className="inline-flex min-h-8 items-center rounded-full border border-foreground/30 border-dashed px-2.5 font-medium hover:bg-muted"
        >
          {short(fromISODate(d))}
        </button>
      ))}
      {more > 0 && <span className="text-foreground/60">and {more} more</span>}
    </nav>
  );
}
