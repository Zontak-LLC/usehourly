"use client";

import { useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { CalendarSuggestions } from "@/components/calendar-suggestions";
import { DigitalWatch, type WatchMode } from "@/components/digital-watch";
import { EntryList } from "@/components/entry-list";
import { MergeEntriesBar } from "@/components/merge-entries-bar";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { useProjectLogos } from "@/components/project-logo";
import { TimerControls, useTodayTimer } from "@/components/timer-control";
import { TimerPanel } from "@/components/timer-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSavedCalendar } from "@/components/use-calendar";
import { useRunningMinutes } from "@/components/use-running-minutes";
import { WeekPills } from "@/components/week-pills";
import { addDays, DATE_RE, fromISODate, monthBounds, startOfWeek } from "@/lib/dates";
import { DAY_GOAL_MINUTES } from "@/lib/day-dial";
import { formatDuration } from "@/lib/duration";
import { feature } from "@/lib/features";
import { trpc } from "@/lib/trpc";
import { useOnline } from "@/lib/use-offline";
import { useToday } from "@/lib/use-today";

import { FirstRun } from "./first-run";
import { QuickAdd } from "./quick-add";
import { TodayLayout } from "./today-layout";

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
  const online = useOnline();
  // What the timer would start for: the project and description picked in the add form below.
  const [timerContext, setTimerContext] = useState({ projectId: "", projectName: "", note: "" });
  const dialClock = useTodayTimer({ ...timerContext, date: date ?? "" });
  const running = trpc.entry.running.useQuery();
  // A timer running on the day shown adds its minutes to the day dial, so there is one clock for the day.
  const timer = running.data?.started_at ? running.data : null;
  const timerOnThisDay = !!timer && timer.date === date;
  const timerMinutes = useRunningMinutes(timerOnThisDay ? timer.started_at : null);
  // Started here, with the first batch, so the quick-add form and the entry rows find them already loaded (they would
  // otherwise start them only after the client list arrives: a second round trip). Same keys, so nothing is fetched twice.
  trpc.project.budgets.useQuery(date ? monthBounds(date) : { from: "", to: "" }, { enabled: !!date });
  useProjectLogos();
  const calendarFirst = useSavedCalendar().calendar !== null;
  const week = trpc.entry.list.useQuery(
    { from: weekStart ?? "", to: weekStart ? addDays(weekStart, 6) : "" },
    { enabled: !!weekStart },
  );

  // Marked days never count as a gap in the week row (same batch as the week's entries: no extra round trip).
  const nonBillableDays = trpc.entry.nonBillableDays.useQuery(
    { from: weekStart ?? "", to: weekStart ? addDays(weekStart, 6) : "" },
    { enabled: !!weekStart },
  );
  const nonBillableSet = new Set(nonBillableDays.data ?? []);

  if (!date) return <Skeleton className="h-64 w-full max-w-5xl" />;

  const go = (d: string) => router.replace(d === today ? "/dashboard/today" : `/dashboard/today?date=${d}`);
  const dayEntries = week.data?.filter((e) => e.date === date) ?? [];
  const sum = (xs: { minutes: number }[]) => xs.reduce((a, e) => a + e.minutes, 0);
  // The running timer counts in the day and week totals as well as in the dial, so the three never disagree.
  const dayTotal = sum(dayEntries) + timerMinutes;
  // Today's stopwatch, part of the day dial: a small window inside the face and steel buttons under the watch (Start,
  // Stop, then Resume / Add to timesheet / Discard). The face itself keeps showing the day.
  // The stopwatch's display follows the timer on the day it runs (today): telling the time, recording, or saved.
  const timerEntry = date === today ? dialClock.entry : null;
  const watchMode: WatchMode =
    dialClock.stopped && date === today
      ? { kind: "stopped", seconds: dialClock.stopped.minutes * 60, label: dialClock.stopped.where }
      : timerEntry
        ? {
            kind: "running",
            seconds: dialClock.seconds,
            label: `${timerEntry.project.name} · ${timerEntry.project.client.name}`,
          }
        : { kind: "time" };

  const weekTotal = week.data ? sum(week.data) + timerMinutes : null;
  const hasProjects = (clients.data ?? []).some((c) => c.projects.length > 0);
  // The two totals are one line under the title (they were two stat cards): this day, and this week.
  const totalsText = week.data
    ? `${formatDuration(dayTotal)} this day · ${formatDuration(weekTotal ?? 0)} this week`
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
      onSwipe={feature("swipe") ? (direction) => go(addDays(date, direction === "left" ? 1 : -1)) : undefined}
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
        <TodayLayout
          watch={
            // The stopwatch (2026-10-23): start a timer, then turn it into an entry. The display tells the time and
            // today's hours; it becomes a stopwatch while recording, and shows what was saved after a stop.
            // The stopwatch (2026-10-23): one digital device. The display tells the time and today's hours, becomes a
            // stopwatch while recording, and shows what was saved after a stop; its buttons are built into the same panel.
            <DigitalWatch
              label={date === today ? "Timer" : "This day"}
              mode={watchMode}
              foot={date === today ? `${formatDuration(dayTotal)} today` : `${formatDuration(dayTotal)} that day`}
              progress={dayTotal / DAY_GOAL_MINUTES}
            >
              {date === today && <TimerControls timer={dialClock} online={online} />}
            </DigitalWatch>
          }
          pills={
            week.data && weekStart ? (
              <WeekPills
                entries={week.data}
                weekStart={weekStart}
                date={date}
                today={today}
                onPick={go}
                nonBillable={nonBillableSet}
              />
            ) : (
              <Skeleton className="h-16 w-full" />
            )
          }
          timerBar={date !== today ? <TimerPanel /> : null}
          form={<QuickAdd date={date} showDate={false} dayMinutes={sum(dayEntries)} onTimerContext={setTimerContext} />}
          calendarTop={
            feature("calendar") && calendarFirst && clients.data ? (
              <CalendarSuggestions date={date} entries={dayEntries} clients={clients.data} />
            ) : null
          }
          entries={
            week.error ? (
              <Notice tone="danger">Couldn't load entries: {week.error.message}</Notice>
            ) : week.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : dayEntries.length === 0 ? null : (
              <>
                <EntryList entries={dayEntries} date={date} today={today} />
                {feature("merge") && <MergeEntriesBar entries={dayEntries} />}
              </>
            )
          }
          calendarBottom={
            feature("calendar") && !calendarFirst && clients.data ? (
              <CalendarSuggestions date={date} entries={dayEntries} clients={clients.data} />
            ) : null
          }
        />
      )}
    </PageShell>
  );
}
