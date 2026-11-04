"use client";

import { useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { ChevronLeft } from "lucide-react";

import { CalendarSuggestions } from "@/components/calendar-suggestions";
import { EntryList } from "@/components/entry-list";
import { MergeEntriesBar } from "@/components/merge-entries-bar";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { useProjectLogos } from "@/components/project-logo";
import { TimerControls, TimerStartLine, useTodayTimer } from "@/components/timer-control";
import { TimerPanel } from "@/components/timer-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useSavedCalendar } from "@/components/use-calendar";
import { useRunningMinutes } from "@/components/use-running-minutes";
import { addDays, DATE_RE, fromISODate, monthBounds, startOfWeek } from "@/lib/dates";
import { MISSED_LOOKBACK_DAYS, missedDays } from "@/lib/day-nav";
import { feature } from "@/lib/features";
import { trpc } from "@/lib/trpc";
import { useOnline } from "@/lib/use-offline";
import { useToday } from "@/lib/use-today";

import { DayCard } from "./day-card";
import { FirstRun } from "./first-run";
import { ImportHint } from "./import-hint";
import { MissedDays } from "./missed-days";
import { NoteReminder } from "./note-reminder";
import { QuickAdd } from "./quick-add";
import { TodayLayout } from "./today-layout";

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
  const todayTimer = useTodayTimer({ ...timerContext, date: date ?? "" });
  const running = trpc.entry.running.useQuery();
  // Whether the account has any entry yet, for the import hint (started here, in the first render: still one request).
  const hasAny = trpc.entry.hasAny.useQuery(undefined, { enabled: feature("importTime") });
  // A timer running on the day shown adds its minutes to the day and week totals in the header.
  const timer = running.data?.started_at ? running.data : null;
  const timerOnThisDay = !!timer && timer.date === date;
  const timerMinutes = useRunningMinutes(timerOnThisDay ? timer.started_at : null);
  // Started here, with the first batch, so the quick-add form and the entry rows find them already loaded (they would
  // otherwise start them only after the client list arrives: a second round trip). Same keys, so nothing is fetched twice.
  trpc.project.budgets.useQuery(date ? monthBounds(date) : { from: "", to: "" }, { enabled: !!date });
  useProjectLogos();
  const calendarFirst = useSavedCalendar().calendar !== null;
  // The week, plus the day on each side of it: the day buttons beside the day show their hours too.
  const week = trpc.entry.list.useQuery(
    { from: weekStart ? addDays(weekStart, -1) : "", to: weekStart ? addDays(weekStart, 7) : "" },
    { enabled: !!weekStart },
  );

  // The last week before today, for the "no time logged on" buttons (started with the rest: still one request).
  const lookback = { from: today ? addDays(today, -MISSED_LOOKBACK_DAYS) : "", to: today ? addDays(today, -1) : "" };
  const recent = trpc.entry.list.useQuery(lookback, { enabled: !!today });
  const recentNonBillable = trpc.entry.nonBillableDays.useQuery(lookback, { enabled: !!today });

  if (!date) return <Skeleton className="h-64 w-full max-w-5xl" />;

  const go = (d: string) => router.replace(d === today ? "/dashboard/today" : `/dashboard/today?date=${d}`);
  const dayEntries = week.data?.filter((e) => e.date === date) ?? [];
  const sum = (xs: { minutes: number }[]) => xs.reduce((a, e) => a + e.minutes, 0);
  // The running timer counts in the day and week totals, so they never disagree with the timesheet.
  const dayTotal = sum(dayEntries) + timerMinutes;
  const weekEnd = weekStart ? addDays(weekStart, 6) : "";
  const weekEntries = week.data?.filter((e) => weekStart && e.date >= weekStart && e.date <= weekEnd);
  const weekTotal = weekEntries ? sum(weekEntries) + timerMinutes : null;
  const missed = today && recent.data ? missedDays(recent.data, today, new Set(recentNonBillable.data ?? [])) : [];
  const minutesOn = (d: string) => sum(week.data?.filter((e) => e.date === d) ?? []);
  const hasProjects = (clients.data ?? []).some((c) => c.projects.length > 0);
  return (
    <PageShell
      nav="today"
      title={date === today ? "Today" : shortDate.format(fromISODate(date))}
      description={
        !hasProjects ? (
          shortDate.format(fromISODate(date))
        ) : date !== today ? (
          <button
            type="button"
            aria-label="Back to today"
            className="-ml-1 inline-flex min-h-9 items-center gap-1 rounded-full px-1 font-medium text-foreground hover:bg-muted"
            onClick={() => go(today ?? date)}
          >
            <ChevronLeft aria-hidden className="size-4" />
            Back to today
          </button>
        ) : undefined
      }
      descriptionOnPhone
      inlineDescription
      // Swipe left for the next day, right for the previous one (the day buttons do the same).
      onSwipe={feature("swipe") ? (direction) => go(addDays(date, direction === "left" ? 1 : -1)) : undefined}
    >
      <ImportHint
        hasEntries={hasAny.data}
        weekLoaded={!!week.data}
        weekHasEntries={(week.data?.length ?? 0) > 0 || !!running.data}
      />
      {clients.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : !hasProjects ? (
        <FirstRun />
      ) : (
        <TodayLayout
          pills={
            <DayCard
              date={date}
              today={today}
              minutesOn={minutesOn}
              dayTotal={dayTotal}
              weekTotal={weekTotal}
              onPick={go}
              footer={
                // The days with no time, the one place that tells about them (issue 99 nudge; the timer is in the Log time card),
                // and the day's entries that still have no note (log first, note later).
                // The footer hides itself when neither has anything to say (`empty:hidden` in DayCard).
                <>
                  <NoteReminder entries={dayEntries} date={date} today={today} />
                  {today && missed.some((d) => d !== date) && (
                    <MissedDays days={missed} date={date} today={today} onPick={go} />
                  )}
                </>
              }
            />
          }
          // On another day a running timer shows as its own bar with Stop.
          timerBar={date === today ? null : <TimerPanel />}
          form={
            <QuickAdd
              date={date}
              showDate={false}
              dayMinutes={sum(dayEntries)}
              onTimerContext={setTimerContext}
              // One project picker on Today (issue 218): the timer runs inside the Log time card, on today only.
              timerTop={date === today ? <TimerControls timer={todayTimer} /> : null}
              timerFoot={date === today ? <TimerStartLine timer={todayTimer} online={online} /> : null}
            />
          }
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
