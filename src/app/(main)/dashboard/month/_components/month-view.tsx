"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";

import { DayEditorDialog } from "@/components/day-editor";
import { MergeDaysPanel } from "@/components/merge-days-panel";
import { ProjectFilter, useProjectFilter } from "@/components/project-filter";
import { ShareExportMenu } from "@/components/share-export-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkItems } from "@/components/work-items";
import { addDays, fromISODate, startOfWeek, toISODate } from "@/lib/dates";
import { formatDecimalHours, formatDuration } from "@/lib/duration";
import { rectDays } from "@/lib/grid-select";
import { buildSheet, dateRange, type SheetEntry } from "@/lib/timesheet";
import { trpc } from "@/lib/trpc";

import { QuickCreate } from "./quick-create";

const monthTitle = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** First of the month as YYYY-MM-DD, shifted by `n` months. */
function shiftMonth(first: string, n: number): string {
  const d = fromISODate(first);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

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
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  // Mouse drag-select: a rectangle of cells (row/column in the grid), like a spreadsheet.
  type Drag = { r0: number; c0: number; r1: number; c1: number; additive: boolean; base: Set<string>; moved: boolean };
  const [drag, setDrag] = useState<Drag | null>(null);
  const commitDrag = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const up = () => commitDrag.current?.();
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [dragging]);
  useEffect(() => {
    const t = toISODate(new Date());
    setToday(t);
    setFirst(`${(initialMonth ?? t).slice(0, 7)}-01`);
  }, [initialMonth]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a different month starts a fresh selection
  useEffect(() => setPicked(new Set()), [first]);

  const last = first ? monthEnd(first) : "";
  const entries = trpc.entry.list.useQuery({ from: first ?? "", to: last }, { enabled: !!first });
  const shown = useMemo(
    () => ((entries.data ?? []) as unknown as SheetEntry[]).filter((e) => !projectId || e.project_id === projectId),
    [entries.data, projectId],
  );
  const sheet = useMemo(() => buildSheet(shown), [shown]);
  // The project list always shows every project, so picking one never hides the others.
  const allRows = useMemo(() => buildSheet((entries.data ?? []) as unknown as SheetEntry[]).rows, [entries.data]);

  if (!first) return <Skeleton className="h-96 w-full" />;

  // Calendar weeks (Mon-first) covering the month, padded with neighbouring days.
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(last), 6);
  const gridDays = dateRange(gridStart, gridEnd, addDays);
  const weeks = Array.from({ length: gridDays.length / 7 }, (_, i) => gridDays.slice(i * 7, i * 7 + 7));
  const monthDays = dateRange(first, last, addDays);
  const max = Math.max(1, ...Object.values(sheet.dayTotals));
  const inMonth = (d: string) => d >= first && d <= last;

  // The dragged rectangle's in-month days; while dragging it replaces (or, with Ctrl/⌘, extends)
  // the committed selection, so the highlight is live.
  let shownPicked = picked;
  if (drag?.moved) {
    const rect = rectDays(weeks, drag, inMonth);
    shownPicked = drag.additive ? new Set([...drag.base, ...rect]) : rect;
  }
  commitDrag.current = () => {
    if (drag?.moved) {
      suppressClick.current = true; // the click that follows a drag must not toggle/open
      setSelectMode(true);
      setPicked(shownPicked);
    }
    setDrag(null);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3 rounded-xl border bg-card p-4">
        <div>
          <h1 className="font-semibold text-xl">{monthTitle.format(fromISODate(first))}</h1>
          <p className="text-muted-foreground text-sm">
            {formatDuration(sheet.total)} logged ({formatDecimalHours(sheet.total)} h)
          </p>
        </div>
        <div
          data-testid="timesheet-toolbar"
          className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap sm:*:min-w-0 sm:*:flex-1"
        >
          <Button
            variant={selectMode ? "default" : "outline"}
            className="h-10 max-sm:flex-1"
            onClick={() => {
              setSelectMode((on) => !on);
              setPicked(new Set());
            }}
            aria-pressed={selectMode}
          >
            <CalendarPlus /> Add to several days
          </Button>
          <ProjectFilter className="h-10 max-sm:flex-1" value={projectId} onChange={setProjectId} />
          <ShareExportMenu
            className="h-10 max-sm:flex-1"
            entries={entries.data ? shown : undefined}
            days={monthDays}
            filename={`usehourly-${first.slice(0, 7)}.xlsx`}
            period="month"
            defaultFrom={first}
            defaultTo={last}
            projectId={projectId}
          />
          <div className="flex items-center overflow-hidden rounded-lg border bg-card max-sm:w-full sm:min-w-44">
            <Button
              size="icon"
              variant="ghost"
              className="size-10 rounded-none"
              onClick={() => setFirst(shiftMonth(first, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              className="h-10 flex-1 rounded-none border-x"
              onClick={() => today && setFirst(`${today.slice(0, 7)}-01`)}
            >
              This month
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-10 rounded-none"
              onClick={() => setFirst(shiftMonth(first, 1))}
              aria-label="Next month"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </header>

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

          <div className="overflow-x-auto rounded-xl border bg-card">
            <div className="grid select-none grid-cols-7 text-sm sm:min-w-[680px] sm:grid-cols-[repeat(7,minmax(0,1fr))_5.5rem]">
              {[...weekdayNames, "Week"].map((n) => (
                <div
                  key={n}
                  className={`border-b px-0.5 py-2 text-center text-muted-foreground text-xs sm:px-2 ${n === "Week" ? "hidden sm:block" : ""}`}
                >
                  {n}
                </div>
              ))}
              {weeks.map((w, ri) => {
                const weekTotal = w.reduce((a, d) => a + (inMonth(d) ? (sheet.dayTotals[d] ?? 0) : 0), 0);
                return (
                  <div key={w[0]} className="contents">
                    {w.map((d, ci) => {
                      const mins = inMonth(d) ? (sheet.dayTotals[d] ?? 0) : 0;
                      return (
                        <button
                          key={d}
                          type="button"
                          onPointerDown={(e) => {
                            if (e.pointerType !== "mouse" || e.button !== 0) return;
                            suppressClick.current = false;
                            setDrag({
                              r0: ri,
                              c0: ci,
                              r1: ri,
                              c1: ci,
                              additive: e.ctrlKey || e.metaKey || e.shiftKey,
                              base: new Set(picked),
                              moved: false,
                            });
                          }}
                          onPointerEnter={() => {
                            if (!drag || (drag.r1 === ri && drag.c1 === ci)) return;
                            setDrag({
                              ...drag,
                              r1: ri,
                              c1: ci,
                              moved: drag.moved || ri !== drag.r0 || ci !== drag.c0,
                            });
                          }}
                          onClick={() => {
                            if (suppressClick.current) {
                              suppressClick.current = false;
                              return;
                            }
                            if (!selectMode) return setEditDate(d);
                            if (!inMonth(d)) return;
                            setPicked((prev) => {
                              const next = new Set(prev);
                              next.has(d) ? next.delete(d) : next.add(d);
                              return next;
                            });
                          }}
                          aria-pressed={selectMode ? shownPicked.has(d) : undefined}
                          aria-label={`${d}: ${formatDuration(mins)}`}
                          className={`flex min-h-16 cursor-pointer flex-col justify-between border-r border-b p-1 text-left transition-colors hover:bg-muted sm:min-h-20 sm:p-2 ${
                            inMonth(d) ? "" : "bg-muted/30 text-muted-foreground/50"
                          } ${d === today ? "ring-2 ring-primary ring-inset" : ""} ${
                            shownPicked.has(d) ? "bg-primary/15 outline-2 outline-primary -outline-offset-2" : ""
                          }`}
                          style={
                            mins
                              ? {
                                  backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round((mins / max) * 28) + 6}%, transparent)`,
                                }
                              : undefined
                          }
                        >
                          <span className="text-xs">{Number(d.slice(8))}</span>
                          <span className="text-right font-mono text-[11px] tabular-nums sm:text-sm">
                            {mins ? formatDuration(mins) : ""}
                          </span>
                        </button>
                      );
                    })}
                    <div className="hidden items-end justify-end border-b bg-muted/40 p-2 font-medium font-mono tabular-nums sm:flex">
                      {weekTotal ? formatDuration(weekTotal) : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-base">By project</h2>
              {projectId && (
                <Button size="sm" variant="outline" onClick={() => setProjectId("")}>
                  Show all projects
                </Button>
              )}
            </div>
            {allRows.length === 0 ? (
              <p className="rounded-xl border bg-card px-4 py-8 text-center text-muted-foreground text-sm">
                No time logged this month.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {allRows.map((r) => {
                  const on = r.projectId === projectId;
                  return (
                    <button
                      key={r.projectId}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setProjectId(on ? "" : r.projectId)}
                      title={on ? "Show all projects again" : "Show only this project"}
                      className={`flex min-h-20 flex-col justify-between gap-2 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted ${
                        on ? "border-primary bg-primary/10" : projectId ? "text-muted-foreground" : ""
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.project}</span>
                          <span className="block truncate text-muted-foreground text-xs">{r.client}</span>
                        </span>
                      </span>
                      <span className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
                        <span className="font-semibold text-lg">{formatDuration(r.total)}</span>
                        <span className="text-muted-foreground text-xs">{formatDecimalHours(r.total)} h</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <MergeDaysPanel entries={shown} />

          {/* Keyed by month + project so a new view starts on page 1 with a clear search. */}
          <WorkItems key={`${first}-${projectId}`} entries={shown} onOpenDay={setEditDate} period="month" />
        </>
      )}
    </div>
  );
}
