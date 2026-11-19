"use client";

import { useEffect, useState } from "react";

import { CalendarX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fromISODate } from "@/lib/dates";
import { loadNotNow, MISSED_SHOWN, nudgeDay, saveNotNow } from "@/lib/day-nav";
import { safeStorage } from "@/lib/offline-cache";

const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: "long" });
/** "Mon 19": the weekday first, whatever order the browser's language uses for the two together. */
const short = (d: Date) => `${weekday.format(d)} ${d.getDate()}`;
const full = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

/**
 * The ONE place Today tells about days with no time (2026-10-23, the nudge since issue 99). The last weekday, when it
 * has nothing, gets a calm line: "Nothing logged on Thursday. Add it now · Not now" ("Not now" hides it for that date
 * on this device). Older empty weekdays are small buttons that open the day. Nothing shows when there are none. In the
 * app only: no email ever says this.
 */
export function MissedDays({
  days,
  date,
  today,
  onPick,
}: {
  days: string[];
  date: string;
  today: string;
  onPick: (d: string) => void;
}) {
  const [notNow, setNotNow] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => setNotNow(loadNotNow(safeStorage())), []);

  const others = days.filter((d) => d !== date);
  const nudge = nudgeDay(others, today, notNow);
  const chips = others.filter((d) => d !== nudge);
  if (!nudge && chips.length === 0) return null;
  const shown = chips.slice(-MISSED_SHOWN); // the most recent ones
  const more = chips.length - shown.length;
  return (
    <div className="flex w-full flex-col gap-2">
      {nudge && (
        <section
          aria-label="Missed day"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-foreground/80 text-sm"
        >
          <span className="inline-flex items-center gap-1.5">
            <CalendarX aria-hidden className="size-4" />
            Nothing logged on {weekdayLong.format(fromISODate(nudge))}.
          </span>
          <span className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              aria-label={`Add it now: open ${full.format(fromISODate(nudge))}`}
              onClick={() => onPick(nudge)}
            >
              Add it now
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setNotNow(saveNotNow(safeStorage(), nudge))}
            >
              Not now
            </Button>
          </span>
        </section>
      )}
      {shown.length > 0 && (
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
      )}
    </div>
  );
}
