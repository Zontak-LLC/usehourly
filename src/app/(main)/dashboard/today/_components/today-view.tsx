"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { MergeEntriesBar } from "@/components/merge-entries-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays, DATE_RE, fromISODate, startOfWeek, toISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { trpc } from "@/lib/trpc";

import { BillHint } from "./bill-hint";
import { EntryRow } from "./entry-row";
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

  if (!date) return <Skeleton className="h-64 w-full max-w-3xl" />;

  const go = (d: string) => router.replace(d === today ? "/dashboard/today" : `/dashboard/today?date=${d}`);
  const dayEntries = week.data?.filter((e) => e.date === date) ?? [];
  const sum = (xs: { minutes: number }[]) => xs.reduce((a, e) => a + e.minutes, 0);
  const hasProjects = (clients.data ?? []).some((c) => c.projects.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-semibold text-xl">{date === today ? "Today" : longDate.format(fromISODate(date))}</h1>
          {date === today && <p className="text-muted-foreground text-sm">{longDate.format(fromISODate(date))}</p>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" asChild>
            <Link href={`/dashboard/month?month=${date.slice(0, 7)}`}>
              <CalendarDays />
              <span className="hidden sm:inline">Month</span>
            </Link>
          </Button>
          <Button size="icon" variant="outline" onClick={() => go(addDays(date, -1))} aria-label="Previous day">
            <ChevronLeft />
          </Button>
          <Button variant="outline" onClick={() => go(today ?? date)} disabled={date === today}>
            Today
          </Button>
          <Button size="icon" variant="outline" onClick={() => go(addDays(date, 1))} aria-label="Next day">
            <ChevronRight />
          </Button>
        </div>
      </div>

      <TimerBanner />

      {clients.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : hasProjects ? (
        <QuickAdd date={date} timerRunning={!!running.data} dayMinutes={sum(dayEntries)} />
      ) : (
        <FirstRun />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="This day" value={formatDuration(sum(dayEntries))} />
        <Stat label="This week" value={formatDuration(sum(week.data ?? []))} />
      </div>

      {sum(week.data ?? []) > 0 && <BillHint />}

      {week.error ? (
        <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
          Couldn't load entries: {week.error.message}
        </p>
      ) : week.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : dayEntries.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground text-sm">
          Nothing logged yet. Type a time above, or start a timer.
        </p>
      ) : (
        <>
          <ul className="divide-y rounded-xl border bg-card">
            {dayEntries.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ul>
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
