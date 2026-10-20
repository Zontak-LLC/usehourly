"use client";

import { useEffect, useMemo, useState } from "react";

import { DayEditorDialog } from "@/components/day-editor";
import { MergeDaysPanel } from "@/components/merge-days-panel";
import { PageShell } from "@/components/page-shell";
import { useProjectFilter } from "@/components/project-filter";
import { useProjectLogos } from "@/components/project-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkItems } from "@/components/work-items";
import { addDays, fromISODate, startOfWeek, toISODate } from "@/lib/dates";
import { formatDecimalHours, formatDuration } from "@/lib/duration";
import { buildSheet, dateRange } from "@/lib/timesheet";
import { trpc } from "@/lib/trpc";

import { MonthCalendar } from "./month-calendar";
import { MonthToolbar } from "./month-toolbar";
import { ProjectBreakdown } from "./project-breakdown";
import { QuickCreate } from "./quick-create";
import { useDaySelection } from "./use-day-selection";

const monthTitle = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

function monthEnd(first: string): string {
  const d = fromISODate(first);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function MonthView({ initialMonth, initialProject }: { initialMonth?: string; initialProject?: string }) {
  const [today, setToday] = useState<string | null>(null);
  const [first, setFirst] = useState<string | null>(null);
  const [projectId, setProjectId] = useProjectFilter(initialProject);
  const [editDate, setEditDate] = useState<string | null>(null);
  // Quick-add mode: clicking day cells selects them instead of opening the day editor.
  const [selectMode, setSelectMode] = useState(false);
  const selection = useDaySelection(first, setSelectMode);
  const { setPicked } = selection;
  useEffect(() => {
    const t = toISODate(new Date());
    setToday(t);
    setFirst(`${(initialMonth ?? t).slice(0, 7)}-01`);
  }, [initialMonth]);

  const last = first ? monthEnd(first) : "";
  useProjectLogos(); // the project logos start with the first batch, not after the entries arrive
  const entries = trpc.entry.list.useQuery({ from: first ?? "", to: last }, { enabled: !!first });
  const nonBillableDays = trpc.entry.nonBillableDays.useQuery({ from: first ?? "", to: last }, { enabled: !!first });
  const nonBillable = useMemo(() => new Set(nonBillableDays.data ?? []), [nonBillableDays.data]);
  const shown = useMemo(
    () => (entries.data ?? []).filter((e) => !projectId || e.project_id === projectId),
    [entries.data, projectId],
  );
  const sheet = useMemo(() => buildSheet(shown), [shown]);
  // The project list always shows every project, so picking one never hides the others.
  const allRows = useMemo(() => buildSheet(entries.data ?? []).rows, [entries.data]);

  if (!first) return <Skeleton className="h-96 w-full" />;

  // Calendar weeks (Mon-first) covering the month, padded with neighbouring days.
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(last), 6);
  const gridDays = dateRange(gridStart, gridEnd, addDays);
  const weeks = Array.from({ length: gridDays.length / 7 }, (_, i) => gridDays.slice(i * 7, i * 7 + 7));
  const monthDays = dateRange(first, last, addDays);
  const inMonth = (d: string) => d >= first && d <= last;
  const shownPicked = selection.resolve(weeks, inMonth);

  return (
    <PageShell
      nav="month"
      inlineDescription
      title={monthTitle.format(fromISODate(first))}
      description={`${formatDuration(sheet.total)} logged (${formatDecimalHours(sheet.total)} h)`}
    >
      <MonthToolbar
        first={first}
        last={last}
        today={today}
        monthDays={monthDays}
        shown={entries.data ? shown : undefined}
        selectMode={selectMode}
        projectId={projectId}
        onToggleSelectMode={() => {
          setSelectMode((on) => !on);
          setPicked(new Set());
        }}
        onProjectId={setProjectId}
        onFirst={setFirst}
      />

      <DayEditorDialog date={editDate} onClose={() => setEditDate(null)} />

      {entries.error ? (
        <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
          Couldn't load this month: {entries.error.message}
        </p>
      ) : entries.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          {selectMode && (
            <QuickCreate
              dates={[...shownPicked].sort()}
              entries={shown}
              onSelectWeekdays={() =>
                setPicked(new Set(monthDays.filter((d) => ![0, 6].includes(fromISODate(d).getDay()))))
              }
              onClear={() => setPicked(new Set())}
              onDone={() => setPicked(new Set())}
              onExit={() => {
                setSelectMode(false);
                setPicked(new Set());
              }}
            />
          )}

          <MonthCalendar
            weeks={weeks}
            today={today}
            dayTotals={sheet.dayTotals}
            inMonth={inMonth}
            selectMode={selectMode}
            selection={selection}
            shownPicked={shownPicked}
            nonBillable={nonBillable}
            onOpenDay={setEditDate}
          />

          <ProjectBreakdown rows={allRows} projectId={projectId} onProjectId={setProjectId} />

          <MergeDaysPanel entries={shown} />

          {/* Keyed by month + project so a new view starts on page 1 with a clear search. */}
          <WorkItems
            key={`${first}-${projectId}`}
            entries={shown}
            onOpenDay={setEditDate}
            period="month"
            editInPlace
            nonBillable={nonBillable}
          />
        </>
      )}
    </PageShell>
  );
}
