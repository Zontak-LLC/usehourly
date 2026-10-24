"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AllEntriesFold } from "@/components/all-entries-fold";
import { DayEditorPanel } from "@/components/day-editor";
import { MergeDaysPanel } from "@/components/merge-days-panel";
import { PageShell } from "@/components/page-shell";
import { useProjectFilter } from "@/components/project-filter";
import { useProjectLogos } from "@/components/project-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { WeekPills } from "@/components/week-pills";
import { WorkItems } from "@/components/work-items";
import { addDays, fromISODate, monthBounds, startOfWeek, toISODate } from "@/lib/dates";
import { feature } from "@/lib/features";
import { buildSheet } from "@/lib/timesheet";
import { trpc } from "@/lib/trpc";

import { longDayLabel, WeekTotalCard } from "./week-strip";
import { WeekToolbar } from "./week-toolbar";

/** The chosen day, else today when it is in this week, else Monday. */
function chooseDay(start: string, picked: string | null, today: string | null): string {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return picked && days.includes(picked) ? picked : today && days.includes(today) ? today : days[0];
}

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
    setPicked(initialDate ?? null); // an address with ?date= opens on that day, not just that week
  }, [initialDate]);

  const end = start ? addDays(start, 6) : "";
  const entries = trpc.entry.list.useQuery({ from: start ?? "", to: end }, { enabled: !!start });

  // The day panel below asks for these only once it is on screen, which would be a second round trip. Started here with
  // the first batch (same keys, so nothing is fetched twice). The picked day's own entries are not asked for at all: the
  // panel is handed them from the week's (see weekSeed).
  const day = start && today ? chooseDay(start, picked, today) : "";
  trpc.entry.running.useQuery();
  trpc.project.budgets.useQuery(day ? monthBounds(day) : { from: "", to: "" }, { enabled: !!day });
  useProjectLogos();

  const nonBillableDays = trpc.entry.nonBillableDays.useQuery({ from: start ?? "", to: end }, { enabled: !!start });
  const nonBillable = useMemo(() => new Set(nonBillableDays.data ?? []), [nonBillableDays.data]);

  // Filtering is client-side: the week's entries are already loaded and small.
  const shown = useMemo(
    () => (entries.data ?? []).filter((e) => !projectId || e.project_id === projectId),
    [entries.data, projectId],
  );
  const sheet = useMemo(() => buildSheet(shown), [shown]);

  if (!start) return <Skeleton className="h-64 w-full" />;
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const selected = chooseDay(start, picked, today);
  // The address always says which day (or week) is showing, so a refresh or a shared link comes back to it.
  const writeDate = (d: string | null) => {
    const url = new URL(window.location.href);
    if (d) url.searchParams.set("date", d);
    else url.searchParams.delete("date");
    window.history.replaceState(null, "", url);
  };
  const pickDay = (d: string) => {
    setPicked(d);
    writeDate(d === today ? null : d);
  };
  const openDay = (d: string) => {
    pickDay(d);
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // Swipe left for the next day, right for the previous one; past the week's edge the next or previous week opens.
  const moveDay = (delta: number) => {
    const d = addDays(selected, delta);
    if (d < start || d > end) setStart(startOfWeek(d));
    pickDay(d);
  };
  const goWeek = (s: string) => {
    setStart(s);
    setPicked(null);
    writeDate(today && startOfWeek(today) === s ? null : s);
  };

  return (
    <PageShell
      nav="week"
      title="Weekly timesheet"
      description={
        <>
          {rangeLabel.format(fromISODate(start))} – {rangeLabel.format(fromISODate(end))}
          <span className="max-sm:hidden"> · pick a day to see and change its time</span>
        </>
      }
      descriptionOnPhone
      onSwipe={feature("swipe") ? (direction) => moveDay(direction === "left" ? 1 : -1) : undefined}
    >
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
          Couldn't load entries: {entries.error.message}
        </p>
      ) : entries.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        // Same pattern as Today: the days as one row, then the week's hours and its projects on the left (they stay in
        // view), and the picked day on the right. The full list of the week's entries is folded away (search lives there).
        <div className="flex min-w-0 flex-col gap-4">
          <WeekPills
            entries={shown}
            weekStart={start}
            date={selected}
            today={today}
            onPick={pickDay}
            nonBillable={nonBillable}
            allEntries={entries.data}
          />
          <div className="grid items-start gap-4 md:grid-cols-[15rem_minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)]">
            <div className="flex flex-col gap-4 md:sticky md:top-24">
              <WeekTotalCard
                sheet={sheet}
                weekMinutes={(entries.data ?? []).reduce((a, e) => a + e.minutes, 0)}
                projectId={projectId}
                onProjectId={setProjectId}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <section ref={panelRef} aria-label={longDayLabel.format(fromISODate(selected))} className="scroll-mt-28">
                <DayEditorPanel
                  key={selected}
                  date={selected}
                  projectFilter={projectId}
                  inPage
                  weekSeed={
                    entries.data && nonBillableDays.data
                      ? {
                          entries: entries.data,
                          days: nonBillableDays.data,
                          updatedAt: entries.dataUpdatedAt,
                          daysUpdatedAt: nonBillableDays.dataUpdatedAt,
                        }
                      : undefined
                  }
                />
              </section>
              {feature("merge") && <MergeDaysPanel entries={shown.filter((e) => e.date !== selected)} />}
              <AllEntriesFold period="week" count={shown.length}>
                <WorkItems
                  key={`${start}-${projectId}`}
                  entries={shown}
                  onOpenDay={openDay}
                  period="week"
                  editInPlace
                  nonBillable={nonBillable}
                />
              </AllEntriesFold>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
