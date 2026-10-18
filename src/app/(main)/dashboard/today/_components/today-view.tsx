"use client";

import { useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { EntryList } from "@/components/entry-list";
import { MergeEntriesBar } from "@/components/merge-entries-bar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays, DATE_RE, fromISODate, startOfWeek, toISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { trpc } from "@/lib/trpc";

import { BillHint } from "./bill-hint";
import { FirstRun } from "./first-run";
import { QuickAdd } from "./quick-add";
import { TimerBanner } from "./timer-banner";

const longDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

export function TodayView() {
  const router = useRouter();
  const params = useSearchParams();
  const paramDate = params.get("date");

  // "Today" is the browser's local date — the Worker runs in UTC and can't know it.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(toISODate(new Date())), []);

  const date = paramDate && DATE_RE.test(paramDate) ? paramDate : today;
  const weekStart = date ? startOfWeek(date) : null;

  const clients = trpc.clients.list.useQuery();
  const running = trpc.entry.running.useQuery();
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <PageHeader
        title={date === today ? "Today" : longDate.format(fromISODate(date))}
        description={date === today ? longDate.format(fromISODate(date)) : undefined}
        actions={
          hasProjects && (
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" onClick={() => go(addDays(date, -1))} aria-label="Previous day">
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                className="disabled:bg-muted disabled:text-foreground/70 disabled:opacity-100"
                onClick={() => go(today ?? date)}
                disabled={date === today}
              >
                Today
              </Button>
              <Button size="icon" variant="outline" onClick={() => go(addDays(date, 1))} aria-label="Next day">
                <ChevronRight />
              </Button>
            </div>
          )
        }
      />

      <TimerBanner />

      {clients.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : hasProjects ? (
        <QuickAdd date={date} timerRunning={!!running.data} dayMinutes={sum(dayEntries)} />
      ) : (
        <FirstRun />
      )}

      {/* Nothing to total or to bill until there is a project to log against (the first-run question comes first). */}
      {hasProjects && (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="This day" value={formatDuration(sum(dayEntries))} />
          <Stat label="This week" value={formatDuration(sum(week.data ?? []))} />
        </div>
      )}

      {hasProjects && sum(week.data ?? []) > 0 && <BillHint />}

      {week.error ? (
        <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
          Couldn't load entries: {week.error.message}
        </p>
      ) : week.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !hasProjects ? null : dayEntries.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground text-sm">
          Nothing logged yet. Type a time above, or start a timer.
        </p>
      ) : (
        <>
          <EntryList entries={dayEntries} title={date === today ? "Today's entries" : "Entries"} />
          <MergeEntriesBar entries={dayEntries} />
        </>
      )}
    </div>
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
