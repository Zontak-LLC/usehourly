"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { CalendarSuggestions } from "@/components/calendar-suggestions";
import { EntryList } from "@/components/entry-list";
import { MergeEntriesBar } from "@/components/merge-entries-bar";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { useProjectLogos } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays, DATE_RE, fromISODate, monthBounds, startOfWeek } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { trpc } from "@/lib/trpc";
import { useToday } from "@/lib/use-today";

import { FirstRun } from "./first-run";
import { QuickAdd } from "./quick-add";
import { TimerBanner } from "./timer-banner";

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
  const week = trpc.entry.list.useQuery(
    { from: weekStart ?? "", to: weekStart ? addDays(weekStart, 6) : "" },
    { enabled: !!weekStart },
  );

  if (!date) return <Skeleton className="h-64 w-full max-w-5xl" />;

  const go = (d: string) => router.replace(d === today ? "/dashboard/today" : `/dashboard/today?date=${d}`);
  const dayEntries = week.data?.filter((e) => e.date === date) ?? [];
  const sum = (xs: { minutes: number }[]) => xs.reduce((a, e) => a + e.minutes, 0);
  const hasProjects = (clients.data ?? []).some((c) => c.projects.length > 0);

  return (
    <PageShell
      nav="today"
      title={date === today ? "Today" : shortDate.format(fromISODate(date))}
      description={
        date === today ? (
          shortDate.format(fromISODate(date))
        ) : (
          <button
            type="button"
            aria-label="Back to today"
            className="py-1 font-medium text-foreground underline"
            onClick={() => go(today ?? date)}
          >
            Today
          </button>
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
      <TimerBanner />

      {clients.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : hasProjects ? (
        <QuickAdd date={date} showDate={false} timerRunning={!!running.data} dayMinutes={sum(dayEntries)} />
      ) : (
        <FirstRun />
      )}

      {hasProjects && clients.data && <CalendarSuggestions date={date} entries={dayEntries} clients={clients.data} />}

      {/* Nothing to total or to bill until there is a project to log against (the first-run question comes first). */}
      {hasProjects && (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="This day" value={formatDuration(sum(dayEntries))} />
          <Stat label="This week" value={formatDuration(sum(week.data ?? []))} />
        </div>
      )}

      {week.error ? (
        <Notice tone="danger">Couldn't load entries: {week.error.message}</Notice>
      ) : week.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !hasProjects || dayEntries.length === 0 ? null : (
        <>
          <EntryList entries={dayEntries} date={date} today={today} />
          <MergeEntriesBar entries={dayEntries} />
        </>
      )}
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-mono font-semibold text-2xl tabular-nums">{value}</p>
    </div>
  );
}
