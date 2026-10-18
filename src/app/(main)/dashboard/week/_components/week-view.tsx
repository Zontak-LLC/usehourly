"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { DayEditorPanel } from "@/components/day-editor";
import { MergeDaysPanel } from "@/components/merge-days-panel";
import { ProjectFilter, toggleProjectFilter, useProjectFilter } from "@/components/project-filter";
import { ShareExportMenu } from "@/components/share-export-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkItems } from "@/components/work-items";
import { addDays, fromISODate, startOfWeek, toISODate } from "@/lib/dates";
import { formatDecimalHours, formatDuration } from "@/lib/duration";
import { buildSheet, type SheetEntry } from "@/lib/timesheet";
import { trpc } from "@/lib/trpc";

const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const rangeLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const longDayLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

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
    () => ((entries.data ?? []) as unknown as SheetEntry[]).filter((e) => !projectId || e.project_id === projectId),
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
    <div className="mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-muted/30">
      <header className="border-b bg-muted/60 px-3 py-3 sm:px-5">
        <h1 className="font-semibold text-xl">Weekly timesheet</h1>
        <p className="text-muted-foreground text-sm">
          {rangeLabel.format(fromISODate(start))} – {rangeLabel.format(fromISODate(end))}
          <span className="max-sm:hidden"> · pick a day to see and change its time</span>
        </p>
      </header>
      <div className="flex flex-col gap-4 p-3 sm:p-5">
        <div
          data-testid="timesheet-toolbar"
          className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap sm:*:min-w-0 sm:*:flex-1"
        >
          <ProjectFilter className="h-10 max-sm:flex-1" value={projectId} onChange={setProjectId} />
          <ShareExportMenu
            className="h-10 max-sm:flex-1"
            entries={entries.data ? shown : undefined}
            days={days}
            filename={`usehourly-${start}_to_${end}.xlsx`}
            period="week"
            defaultFrom={start}
            defaultTo={end}
            projectId={projectId}
          />
          <div className="flex items-center overflow-hidden rounded-lg border bg-card max-sm:w-full sm:min-w-44">
            <Button
              size="icon"
              variant="ghost"
              className="size-10 rounded-none"
              onClick={() => goWeek(addDays(start, -7))}
              aria-label="Previous week"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              className="h-10 flex-1 rounded-none border-x"
              onClick={() => today && goWeek(startOfWeek(today))}
            >
              This week
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-10 rounded-none"
              onClick={() => goWeek(addDays(start, 7))}
              aria-label="Next week"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        {entries.error ? (
          <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
            Couldn't load the timesheet: {entries.error.message}
          </p>
        ) : entries.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            {/* The week as seven tiles. Pick one and its entries and the add form open below. */}
            <div role="tablist" aria-label="Days of the week" className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {days.map((d) => {
                const on = d === selected;
                const total = sheet.dayTotals[d] ?? 0;
                const date = fromISODate(d);
                return (
                  <button
                    key={d}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-label={`${longDayLabel.format(date)}, ${total ? formatDuration(total) : "nothing logged"}`}
                    onClick={() => setPicked(d)}
                    className={`flex min-h-24 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-3 transition-colors ${
                      on
                        ? "border-primary bg-primary/15 shadow-sm ring-2 ring-primary/40"
                        : d === today
                          ? "border-primary/50 bg-card hover:bg-muted"
                          : "bg-card hover:bg-muted"
                    } ${[0, 6].includes(date.getDay()) && !on ? "bg-muted/40" : ""}`}
                  >
                    <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      {weekdayShort.format(date)}
                    </span>
                    <span className="font-semibold text-xl leading-none">{date.getDate()}</span>
                    <span
                      className={`font-mono text-xs tabular-nums sm:text-sm ${total ? "font-medium" : "text-muted-foreground"}`}
                    >
                      {total ? formatDuration(total) : "–"}
                    </span>
                    <span className={`text-[10px] text-primary uppercase ${d === today ? "" : "invisible"}`}>
                      Today
                    </span>
                  </button>
                );
              })}
            </div>

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

            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold text-base">This week</h2>
                <span className="font-semibold font-mono text-lg tabular-nums">
                  {formatDuration(sheet.total)}
                  <span className="ml-1 font-normal text-muted-foreground text-xs">
                    ({formatDecimalHours(sheet.total)} h)
                  </span>
                </span>
              </div>
              {sheet.rows.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {sheet.rows.map((r) => {
                    const on = projectId === r.projectId;
                    return (
                      <li key={r.projectId}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => setProjectId(toggleProjectFilter(projectId, r.projectId))}
                          title={on ? "Show all projects" : `Show only ${r.project}`}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-muted ${
                            on ? "border-primary bg-primary/10" : ""
                          }`}
                        >
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                          <span className="font-medium">{r.project}</span>
                          <span className="text-muted-foreground">· {r.client}</span>
                          <span className="font-mono tabular-nums">{formatDuration(r.total)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

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
