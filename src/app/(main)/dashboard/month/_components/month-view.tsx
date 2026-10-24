"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useSearchParams } from "next/navigation";

import { DayEditorPanel, periodSeed } from "@/components/day-editor";
import { MergeDaysPanel } from "@/components/merge-days-panel";
import { PageShell } from "@/components/page-shell";
import { PeriodStepper } from "@/components/period-stepper";
import { useProjectFilter } from "@/components/project-filter";
import { useProjectLogos } from "@/components/project-logo";
import { SegmentedSwitch } from "@/components/segmented-switch";
import { SIDE_CARD, SideColumn, SideScroll } from "@/components/side-column";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkItems } from "@/components/work-items";
import { addDays, addMonths, fromISODate, monthBounds, startOfWeek, toISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { feature } from "@/lib/features";
import { defaultMonthDay, type MonthMode, readMonthAddress } from "@/lib/month-address";
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
const longDayLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

const MODES = [
  ["day", "Day"],
  ["month", "Whole month"],
] as const;

/**
 * Changes the address in place. `push` for what a person opens (a day, a view), so Back returns to it; `replace` for
 * stepping with ‹ › (a dozen steps are not a dozen Backs). Next follows both, so the page re-reads the address.
 */
function writeAddress(changes: Record<string, string | null>, how: "push" | "replace") {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(changes)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  if (url.href === window.location.href) return;
  if (how === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/**
 * Month: the calendar on the left (sticky from 768px), and on the right one day (‹ › to step, its entries, the Log time
 * form behind one button) or the whole month's list. The address holds the month, the day and the view, so a reload
 * or Back keeps them. On a phone the calendar comes first and the day under it.
 */
export function MonthView({ initialProject }: { initialProject?: string }) {
  const params = useSearchParams();
  const [today, setToday] = useState<string | null>(null);
  const [projectId, setProjectId] = useProjectFilter(initialProject);
  const dayRef = useRef<HTMLDivElement>(null);
  // Bumped when a day is picked, so the right side is brought into view (on a phone it sits under the calendar).
  const [picks, setPicks] = useState(0);
  useEffect(() => {
    if (picks) dayRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [picks]);
  // Quick-add mode: clicking day cells selects them instead of opening the day.
  const [selectMode, setSelectMode] = useState(false);
  useEffect(() => setToday(toISODate(new Date())), []);
  const address = today ? readMonthAddress(params, today) : null;
  const first = address?.first ?? null;
  const selection = useDaySelection(first, setSelectMode);
  const { setPicked } = selection;
  // Dragging an entry of the day onto another day of the calendar moves it there.
  const drag = useEntryDrag();

  const last = first ? monthBounds(first).to : "";
  useProjectLogos(); // the project logos start with the first batch, not after the entries arrive
  const entries = trpc.entry.list.useQuery({ from: first ?? "", to: last }, { enabled: !!first });
  const nonBillableDays = trpc.entry.nonBillableDays.useQuery({ from: first ?? "", to: last }, { enabled: !!first });
  const nonBillable = useMemo(() => new Set(nonBillableDays.data ?? []), [nonBillableDays.data]);
  const shown = useMemo(
    () => (entries.data ?? []).filter((e) => !projectId || e.project_id === projectId),
    [entries.data, projectId],
  );
  const sheet = useMemo(() => buildSheet(shown), [shown]);
  const day =
    address && first && today
      ? (address.date ??
        defaultMonthDay(
          first,
          last,
          today,
          shown.map((e) => e.date),
        ))
      : "";
  // The day panel and its form ask for these; started here with the first batch (same keys), so the page stays ONE
  // request. The day's own entries come from the month's (`seed`).
  trpc.entry.running.useQuery();
  trpc.project.budgets.useQuery(day ? monthBounds(day) : { from: "", to: "" }, { enabled: !!day });

  if (!address || !first || !today) return <Skeleton className="h-96 w-full" />;
  const mode: MonthMode = address.mode;

  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(last), 6);
  const gridDays = dateRange(gridStart, gridEnd, addDays);
  const weeks = Array.from({ length: gridDays.length / 7 }, (_, i) => gridDays.slice(i * 7, i * 7 + 7));
  const monthDays = dateRange(first, last, addDays);
  const inMonth = (d: string) => d >= first && d <= last;
  const shownPicked = selection.resolve(weeks, inMonth);

  const pickDay = (d: string) => {
    writeAddress({ month: d.slice(0, 7), date: d, view: null }, "push");
    setPicks((n) => n + 1);
  };
  // ‹ › on the day: the day before or after; past the month's edge that month opens.
  const stepDay = (delta: number) => {
    const d = addDays(day, delta);
    writeAddress({ month: d.slice(0, 7), date: d }, "replace");
  };
  const goMonth = (f: string) => writeAddress({ month: f.slice(0, 7), date: null }, "replace");
  // The day stays in the address when switching to the whole month, so Day comes back to it.
  const setMode = (m: MonthMode) => writeAddress({ date: day, view: m === "month" ? "month" : null }, "push");
  const thisMonth = `${today.slice(0, 7)}-01`;

  return (
    <PageShell
      nav="month"
      onSwipe={
        feature("swipe")
          ? (direction) =>
              mode === "day"
                ? stepDay(direction === "left" ? 1 : -1)
                : goMonth(addMonths(first, direction === "left" ? 1 : -1))
          : undefined
      }
      inlineDescription
      // The month's total is the page's key figure: shown on a phone too.
      descriptionOnPhone
      title={monthTitle.format(fromISODate(first))}
      description={
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
        monthDays={monthDays}
        shown={entries.data ? shown : undefined}
        selectMode={selectMode}
        projectId={projectId}
        onToggleSelectMode={() => {
          setSelectMode((on) => !on);
          setPicked(new Set());
        }}
        onProjectId={setProjectId}
      />

      {entries.error ? (
        <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
          Couldn't load this month: {entries.error.message}
        </p>
      ) : entries.isLoading || nonBillableDays.isLoading ? (
        // Both, so the day panel is seeded from the start (its own query would be a second request).
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
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

          <div className="grid items-start gap-4 md:grid-cols-[20rem_minmax(0,1fr)] lg:grid-cols-[24rem_minmax(0,1fr)]">
            {/* The calendar stays in view (sticky) while the right side scrolls; on a phone it simply comes first. */}
            <SideColumn inFlow>
              <section aria-label="Calendar" className={SIDE_CARD}>
                <SideScroll>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <PeriodStepper
                        className="flex-1"
                        label={monthTitle.format(fromISODate(first))}
                        prev="Previous month"
                        next="Next month"
                        onPrev={() => goMonth(addMonths(first, -1))}
                        onNext={() => goMonth(addMonths(first, 1))}
                      />
                      {/* Only when looking at another month. */}
                      {first !== thisMonth && (
                        <Button variant="outline" className="h-10" onClick={() => goMonth(thisMonth)}>
                          This month
                        </Button>
                      )}
                    </div>
                    <MonthCalendar
                      weeks={weeks}
                      today={today}
                      dayTotals={sheet.dayTotals}
                      rows={sheet.rows}
                      inMonth={inMonth}
                      openDay={day}
                      selectMode={selectMode && feature("multiDay")}
                      rangeSelect={feature("multiDay")}
                      selection={selection}
                      shownPicked={shownPicked}
                      nonBillable={nonBillable}
                      drag={drag}
                      onOpenDay={pickDay}
                    />
                    <MonthFacts dayTotals={sheet.dayTotals} />
                  </div>
                </SideScroll>
              </section>
            </SideColumn>

            <div ref={dayRef} className="flex min-w-0 scroll-mt-28 flex-col gap-4">
              <SegmentedSwitch label="Show" options={MODES} value={mode} onChange={setMode} className="sm:self-start" />
              {mode === "day" ? (
                <section aria-label={longDayLabel.format(fromISODate(day))}>
                  <DayEditorPanel
                    key={day}
                    date={day}
                    projectFilter={projectId}
                    onStep={stepDay}
                    addBehindButton
                    entryGrip={(entry) => <EntryGrip entry={entry} drag={drag} />}
                    seed={periodSeed(entries, nonBillableDays)}
                  />
                </section>
              ) : shown.length === 0 ? (
                <p className="rounded-3xl border bg-card p-6 text-center text-muted-foreground text-sm">
                  No entries this month.
                </p>
              ) : (
                // Keyed by month + project so a new view starts on page 1 with a clear search.
                <WorkItems
                  key={`${first}-${projectId}`}
                  entries={shown}
                  onOpenDay={pickDay}
                  period="month"
                  editInPlace
                  nonBillable={nonBillable}
                />
              )}
              {feature("merge") && <MergeDaysPanel entries={shown} />}
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
