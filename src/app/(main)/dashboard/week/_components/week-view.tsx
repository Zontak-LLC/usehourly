"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { DayEditorPanel } from "@/components/day-editor";
import { MergeDaysPanel } from "@/components/merge-days-panel";
import { useProjectFilter } from "@/components/project-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkItems } from "@/components/work-items";
import { addDays, fromISODate, startOfWeek, toISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { buildSheet } from "@/lib/timesheet";
import { trpc } from "@/lib/trpc";

import { DayTiles, longDayLabel, WeekTotalCard } from "./week-strip";
import { WeekToolbar } from "./week-toolbar";

const rangeLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function WeekView({ initialProject, initialDate }: { initialProject?: string; initialDate?: string }) {
  const [today, setToday] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null); // the day chosen in the strip
  const [projectId, setProjectId] = useProjectFilter(initialProject);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const t = toISODate(new Date());
    setToday(t);
    setStart(startOfWeek(initialDate ?? t));
  }, [initialDate]);

  const end = start ? addDays(start, 6) : "";
  const entries = trpc.entry.list.useQuery({ from: start ?? "", to: end }, { enabled: !!start });

  // Filtering is client-side: the week's entries are already loaded and small.
  const shown = useMemo(
    () => (entries.data ?? []).filter((e) => !projectId || e.project_id === projectId),
    [entries.data, projectId],
  );
  const sheet = useMemo(() => buildSheet(shown), [shown]);

  if (!start) return <Skeleton className="h-64 w-full" />;
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  // The chosen day, else today when it is in this week, else Monday.
  const selected = picked && days.includes(picked) ? picked : today && days.includes(today) ? today : days[0];
  const openDay = (d: string) => {
    setPicked(d);
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const goWeek = (s: string) => {
    setStart(s);
    setPicked(null);
  };

  return (
    // One container around the whole page: the header, the week, the day and the lists sit inside it.
    <div className="mx-auto flex w-full max-w-5xl flex-col overflow-hidden max-sm:-m-2 max-sm:w-[calc(100%+1rem)] border bg-muted/30 max-sm:border-x-0 sm:rounded-2xl">
      <header className="border-b bg-muted/60 px-3 py-3 sm:px-5">
        <h1 className="font-semibold text-xl">Weekly timesheet</h1>
        <p className="text-muted-foreground text-sm">
          {rangeLabel.format(fromISODate(start))} – {rangeLabel.format(fromISODate(end))}
          <span className="max-sm:hidden"> · pick a day to see and change its time</span>
        </p>
      </header>
      <div className="flex flex-col gap-4 p-2 sm:p-5">
        <WeekToolbar
          start={start}
          end={end}
          today={today}
          days={days}
          shown={entries.data ? shown : undefined}
          projectId={projectId}
          onProjectId={setProjectId}
          onWeek={goWeek}
        />

        {entries.error ? (
          <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
            Couldn't load the timesheet: {entries.error.message}
          </p>
        ) : entries.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <DayTiles days={days} selected={selected} today={today} dayTotals={sheet.dayTotals} onPick={setPicked} />

            <section ref={panelRef} aria-label={longDayLabel.format(fromISODate(selected))} className="scroll-mt-28">
              <div className="rounded-xl border bg-card">
                <div className="flex items-baseline justify-between gap-3 border-b bg-muted/40 px-4 py-3">
                  <h2 className="font-semibold text-base">{longDayLabel.format(fromISODate(selected))}</h2>
                  <span className="font-medium font-mono tabular-nums">
                    {sheet.dayTotals[selected] ? formatDuration(sheet.dayTotals[selected]) : "Nothing yet"}
                  </span>
                </div>
                <div className="p-4">
                  <DayEditorPanel key={selected} date={selected} projectFilter={projectId} />
                </div>
              </div>
            </section>

            <WeekTotalCard sheet={sheet} projectId={projectId} onProjectId={setProjectId} />

            {/* The picked day has its own Merge button in the editor above, so this card covers the other days. */}
            <MergeDaysPanel entries={shown.filter((e) => e.date !== selected)} />

            {/* Keyed by week + project so navigating starts on page 1 with a clear search. */}
            <WorkItems key={`${start}-${projectId}`} entries={shown} onOpenDay={openDay} period="week" />
          </>
        )}
      </div>
    </div>
  );
}
