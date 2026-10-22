"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { CalendarSuggestions } from "@/components/calendar-suggestions";
import { DayDial } from "@/components/day-dial";
import { DaySide } from "@/components/day-side";
import { EntryList } from "@/components/entry-list";
import { MergeEntriesBar } from "@/components/merge-entries-bar";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { useProjectLogos } from "@/components/project-logo";
import { TimerPanel } from "@/components/timer-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSavedCalendar } from "@/components/use-calendar";
import { addDays, DATE_RE, fromISODate, monthBounds, startOfWeek } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { trpc } from "@/lib/trpc";
import { useToday } from "@/lib/use-today";

import { FirstRun } from "./first-run";
import { QuickAdd } from "./quick-add";

const _longDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const shortDate = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

export function TodayView() {
  const router = useRouter();
  const params = useSearchParams();
  const paramDate = params.get("date");

  // "Today" is the browser's local date — the Worker runs in UTC and can't know it.
  const today = useToday();

  const date = paramDate && DATE_RE.test(paramDate) ? paramDate : today;
  const weekStart = date ? startOfWeek(date) : null;

  const clients = trpc.clients.list.useQuery();
  const running = trpc.entry.running.useQuery();
  // Started here, with the first batch, so the quick-add form and the entry rows find them already loaded (they would
  // otherwise start them only after the client list arrives: a second round trip). Same keys, so nothing is fetched twice.
  trpc.project.budgets.useQuery(date ? monthBounds(date) : { from: "", to: "" }, { enabled: !!date });
  useProjectLogos();
  const calendarFirst = useSavedCalendar().calendar !== null;
  const week = trpc.entry.list.useQuery(
    { from: weekStart ?? "", to: weekStart ? addDays(weekStart, 6) : "" },
    { enabled: !!weekStart },
  );

  if (!date) return <Skeleton className="h-64 w-full max-w-5xl" />;

  const go = (d: string) => router.replace(d === today ? "/dashboard/today" : `/dashboard/today?date=${d}`);
  const dayEntries = week.data?.filter((e) => e.date === date) ?? [];
  const sum = (xs: { minutes: number }[]) => xs.reduce((a, e) => a + e.minutes, 0);
  const hasProjects = (clients.data ?? []).some((c) => c.projects.length > 0);
  // The two totals are one line under the title (they were two stat cards): this day, and this week.
  const totalsText = week.data
    ? `${formatDuration(sum(dayEntries))} this day · ${formatDuration(sum(week.data))} this week`
    : "";
  // On a wide screen they sit in the header line; on a phone that line has the arrows too, so they go under it.
  const totals = totalsText ? <span className="max-sm:hidden"> · {totalsText}</span> : null;

  return (
    <PageShell
      nav="today"
      title={date === today ? "Today" : shortDate.format(fromISODate(date))}
      description={
        date === today ? (
          <>
            {shortDate.format(fromISODate(date))}
            {hasProjects && totals}
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label="Back to today"
              className="py-1 font-medium text-foreground underline"
              onClick={() => go(today ?? date)}
            >
              Today
            </button>
            {hasProjects && totals}
          </>
        )
      }
      descriptionOnPhone
      inlineDescription
      // Swipe left for the next day, right for the previous one (the arrows in the header do the same).
      onSwipe={(direction) => go(addDays(date, direction === "left" ? 1 : -1))}
      actions={
        hasProjects && (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="size-10"
              onClick={() => go(addDays(date, -1))}
              aria-label="Previous day"
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="size-10"
              onClick={() => go(addDays(date, 1))}
              aria-label="Next day"
            >
              <ChevronRight />
            </Button>
          </div>
        )
      }
    >
      {hasProjects && totalsText && <p className="text-foreground/75 text-sm sm:hidden">{totalsText}</p>}

      {clients.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : !hasProjects ? (
        <FirstRun />
      ) : (
        // A band across the top (the dial, the day by project, the week), then the add form and the day's rows at the full width.
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
            <DayDial
              minutes={sum(dayEntries)}
              weekMinutes={week.data ? sum(week.data) : null}
              timerRunning={!!running.data}
            />
            {week.data && weekStart && (
              <DaySide
                row
                entries={week.data}
                weekStart={weekStart}
                date={date}
                today={today}
                onPick={go}
                after={running.data?.started_at ? <TimerPanel /> : undefined}
              />
            )}
          </div>

          <QuickAdd date={date} showDate={false} timerRunning={!!running.data} dayMinutes={sum(dayEntries)} wide />

          {/* A connected calendar has meetings to log: they sit right under the add form. Not connected, the card waits at the foot. */}
          {calendarFirst && clients.data && (
            <CalendarSuggestions date={date} entries={dayEntries} clients={clients.data} />
          )}

          {week.error ? (
            <Notice tone="danger">Couldn't load entries: {week.error.message}</Notice>
          ) : week.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : dayEntries.length === 0 ? null : (
            <>
              <EntryList entries={dayEntries} date={date} today={today} />
              <MergeEntriesBar entries={dayEntries} />
            </>
          )}

          {!calendarFirst && clients.data && (
            <CalendarSuggestions date={date} entries={dayEntries} clients={clients.data} />
          )}
        </div>
      )}
    </PageShell>
  );
}
