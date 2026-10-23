"use client";

import { useRef, useState } from "react";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDays, addMonths, fromISODate } from "@/lib/dates";
import { minutesByDate, monthWeeks } from "@/lib/day-nav";
import { formatDuration } from "@/lib/duration";
import { trpc } from "@/lib/trpc";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const short = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const full = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const monthName = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

/**
 * Today's day picker: a button with the day shown that opens a month calendar (Week has the seven day tiles; Today is
 * about one day, so it picks from a calendar instead). Each day with time has a dot; today has an amber ring; the day
 * shown is filled. Arrow keys move between days, Enter opens one. The month's entries are fetched only when it opens.
 */
export function DayPicker({
  date,
  today,
  onPick,
  className,
  children,
}: {
  date: string;
  today: string | null;
  onPick: (d: string) => void;
  /** The trigger's look; by default a small link-like date. */
  className?: string;
  /** What the trigger shows; by default the short date with a calendar icon. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(`${date.slice(0, 7)}-01`);
  const grid = useRef<HTMLDivElement>(null);
  const weeks = monthWeeks(month);
  const from = weeks[0]?.[0] ?? month;
  const to = weeks.at(-1)?.[6] ?? month;
  const entries = trpc.entry.list.useQuery({ from, to }, { enabled: open });
  const minutes = minutesByDate(entries.data ?? []);

  const pick = (d: string) => {
    setOpen(false);
    onPick(d);
  };

  // Arrow keys move the focus a day (left/right) or a week (up/down), across months too.
  function onKeyDown(e: React.KeyboardEvent) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    const current = (e.target as HTMLElement).dataset.date;
    if (!step || !current) return;
    e.preventDefault();
    const next = addDays(current, step);
    const focus = () => grid.current?.querySelector<HTMLElement>(`[data-date="${next}"]`)?.focus();
    // Same month: the day is already drawn, so focus it now. Another month: after it is drawn.
    if (next.slice(0, 7) === month.slice(0, 7)) focus();
    else {
      setMonth(`${next.slice(0, 7)}-01`);
      requestAnimationFrame(focus);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setMonth(`${date.slice(0, 7)}-01`);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Pick a day (showing ${full.format(fromISODate(date))})`}
          className={
            className ??
            "inline-flex items-center gap-1 rounded-md py-1 font-medium text-foreground underline-offset-4 hover:underline"
          }
        >
          {children ?? (
            <>
              <CalendarDays aria-hidden className="size-4" />
              {short.format(fromISODate(date))}
              <ChevronDown aria-hidden className="size-3.5 opacity-70" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[19rem] p-3" aria-label="Pick a day">
        <div className="mb-2 flex items-center justify-between">
          <Button
            size="icon"
            variant="ghost"
            className="size-9"
            aria-label="Previous month"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <ChevronLeft />
          </Button>
          <p className="font-medium text-sm" aria-live="polite">
            {monthName.format(fromISODate(month))}
          </p>
          <Button
            size="icon"
            variant="ghost"
            className="size-9"
            aria-label="Next month"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {WEEKDAYS.map((w) => (
            <span key={w} aria-hidden className="pb-1 font-mono text-[10px] text-foreground/60 uppercase">
              {w}
            </span>
          ))}
        </div>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the arrow keys move between the day buttons inside */}
        <div ref={grid} onKeyDown={onKeyDown} className="grid grid-cols-7 gap-0.5" role="presentation">
          {weeks.flat().map((d) => {
            const mins = minutes.get(d) ?? 0;
            const inMonth = d.slice(0, 7) === month.slice(0, 7);
            const shown = d === date;
            return (
              <button
                key={d}
                type="button"
                data-date={d}
                tabIndex={shown || (!month.startsWith(date.slice(0, 7)) && d === month) ? 0 : -1}
                aria-current={shown ? "date" : undefined}
                aria-label={`${full.format(fromISODate(d))}, ${mins ? formatDuration(mins) : "nothing logged"}${d === today ? ", today" : ""}`}
                onClick={() => pick(d)}
                className={`relative flex h-10 flex-col items-center justify-center rounded-lg text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                  shown
                    ? "bg-foreground font-semibold text-background"
                    : `hover:bg-muted ${inMonth ? "" : "text-foreground/40"}`
                } ${d === today && !shown ? "ring-2 ring-amber ring-inset" : ""}`}
              >
                {fromISODate(d).getDate()}
                <span
                  aria-hidden
                  className={`mt-0.5 size-1 rounded-full ${mins ? (shown ? "bg-background" : "bg-foreground/60") : "bg-transparent"}`}
                />
              </button>
            );
          })}
        </div>
        {today && date !== today && (
          <Button variant="outline" className="mt-3 w-full" onClick={() => pick(today)}>
            Go to today
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
