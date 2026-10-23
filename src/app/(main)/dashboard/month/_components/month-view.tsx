"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";

import { AllEntriesFold } from "@/components/all-entries-fold";
import { DayEditorPanel, longDateLabel } from "@/components/day-editor";
import { MergeDaysPanel } from "@/components/merge-days-panel";
import { PageShell } from "@/components/page-shell";
import { useProjectFilter } from "@/components/project-filter";
import { useProjectLogos } from "@/components/project-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkItems } from "@/components/work-items";
import { addDays, addMonths, fromISODate, startOfWeek, toISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { feature } from "@/lib/features";
import { buildSheet, dateRange } from "@/lib/timesheet";
import { trpc } from "@/lib/trpc";

import { EntryGrip } from "./entry-grip";
import { MonthCalendar } from "./month-calendar";
import { MonthFacts } from "./month-facts";
import { MonthToolbar } from "./month-toolbar";
import { QuickCreate } from "./quick-create";
import { useDaySelection } from "./use-day-selection";
import { useEntryDrag } from "./use-entry-drag";

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
  const dayCard = useRef<HTMLElement>(null);
  // The card opens below the calendar; bring it into view when a day is picked.
  useEffect(() => {
    if (editDate) dayCard.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [editDate]);
  // Quick-add mode: clicking day cells selects them instead of opening the day editor.
  const [selectMode, setSelectMode] = useState(false);
  const selection = useDaySelection(first, setSelectMode);
  const { setPicked } = selection;
  // Dragging an entry of the open day onto another day of the calendar moves it there.
  const drag = useEntryDrag();
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
      // Swipe left for the next month, right for the previous one (the arrows in the toolbar do the same).
      onSwipe={feature("swipe") ? (direction) => setFirst(addMonths(first, direction === "left" ? 1 : -1)) : undefined}
      inlineDescription
      title={monthTitle.format(fromISODate(first))}
      description={
        // The month's total is the number people came for: a figure, not small print.
        <>
          <span className="font-display font-extrabold text-foreground text-xl tabular-nums">
            {formatDuration(sheet.total)}
          </span>{" "}
          logged
        </>
      }
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

      {entries.error ? (
        <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
          Couldn't load this month: {entries.error.message}
        </p>
      ) : entries.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          {/* The calendar is the page: it gets the full width. The dial and the lists sit under it. */}
          {selectMode && feature("multiDay") && (
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
            rows={sheet.rows}
            inMonth={inMonth}
            openDay={editDate}
            selectMode={selectMode && feature("multiDay")}
            rangeSelect={feature("multiDay")}
            selection={selection}
            shownPicked={shownPicked}
            nonBillable={nonBillable}
            drag={drag}
            onOpenDay={setEditDate}
          />

          {/* A picked day opens here, under the calendar, as one card (not a pop-up), and closes again. */}
          {editDate && (
            <section ref={dayCard} aria-label={longDateLabel(editDate)} className="scroll-mt-28">
              <DayEditorPanel
                key={editDate}
                date={editDate}
                inPage
                title={longDateLabel(editDate)}
                onClose={() => setEditDate(null)}
                entryGrip={(entry) => <EntryGrip entry={entry} drag={drag} />}
              />
              <Link
                href={`/dashboard/today?date=${editDate}`}
                className="mt-2 inline-block text-muted-foreground text-xs underline"
              >
                Open this day's full page
              </Link>
            </section>
          )}

          <MonthFacts dayTotals={sheet.dayTotals} />
          <div className="flex min-w-0 flex-col gap-4">
            {feature("merge") && <MergeDaysPanel entries={shown} />}

            {/* Keyed by month + project so a new view starts on page 1 with a clear search. */}
            <AllEntriesFold period="month" count={shown.length}>
              <WorkItems
                key={`${first}-${projectId}`}
                entries={shown}
                onOpenDay={setEditDate}
                period="month"
                editInPlace
                nonBillable={nonBillable}
              />
            </AllEntriesFold>
          </div>
        </>
      )}
    </PageShell>
  );
}
