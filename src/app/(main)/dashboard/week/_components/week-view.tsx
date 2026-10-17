"use client";

import { useEffect, useMemo, useState } from "react";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";

import { DayEditorDialog } from "@/components/day-editor";
import { MergeDaysPanel } from "@/components/merge-days-panel";
import { ProjectFilter, toggleProjectFilter, useProjectFilter } from "@/components/project-filter";
import { ProjectMark, useProjectLogos } from "@/components/project-logo";
import { ShareExportMenu } from "@/components/share-export-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewTabs } from "@/components/view-tabs";
import { WorkItems } from "@/components/work-items";
import { addDays, fromISODate, startOfWeek, toISODate } from "@/lib/dates";
import { formatDecimalHours, formatDuration, parseDuration } from "@/lib/duration";
import { buildSheet, type Cell, type SheetEntry } from "@/lib/timesheet";
import { trpc } from "@/lib/trpc";

import { AddEntryPopover } from "./add-entry-popover";
import { FillPopover } from "./fill-popover";
import { type CellEntry, NotePopover } from "./note-popover";

const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });
const rangeLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const longDayLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });

export function WeekView({ initialProject, initialDate }: { initialProject?: string; initialDate?: string }) {
  const utils = trpc.useUtils();
  const [today, setToday] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [projectId, setProjectId] = useProjectFilter(initialProject);
  const [editDate, setEditDate] = useState<string | null>(null);
  const logos = useProjectLogos();
  const [extraIds, setExtraIds] = useState<string[]>([]); // project rows added with no time yet
  const [lastProject, setLastProject] = useState(""); // the project being worked in: preselected in the add-entry popover
  useEffect(() => {
    const t = toISODate(new Date());
    setToday(t);
    setStart(startOfWeek(initialDate ?? t));
  }, [initialDate]);

  const end = start ? addDays(start, 6) : "";
  const entries = trpc.entry.list.useQuery({ from: start ?? "", to: end }, { enabled: !!start });
  const clients = trpc.clients.list.useQuery();
  const bulk = trpc.entry.bulkSet.useMutation();

  const allProjects = useMemo(
    () =>
      (clients.data ?? []).flatMap((c) =>
        c.projects.map((p) => ({ projectId: p.id, project: p.name, client: c.name, color: c.color })),
      ),
    [clients.data],
  );

  // Filtering is client-side: the week's entries are already loaded and small.
  const shown = useMemo(
    () => ((entries.data ?? []) as unknown as SheetEntry[]).filter((e) => !projectId || e.project_id === projectId),
    [entries.data, projectId],
  );

  // project × day -> its single entry (when exactly one, not running), for the note editor.
  const cellEntries = useMemo(() => {
    const byCell = new Map<string, SheetEntry[]>();
    for (const e of shown) {
      const key = `${e.project_id}|${e.date}`;
      byCell.set(key, [...(byCell.get(key) ?? []), e]);
    }
    const single = new Map<string, CellEntry>();
    for (const [key, list] of byCell) {
      if (list.length === 1 && !list[0].started_at) single.set(key, { id: list[0].id, note: list[0].note });
    }
    return single;
  }, [shown]);

  const sheet = useMemo(
    () =>
      buildSheet(
        shown,
        // A filtered project always gets its row, even with no time yet, so its days can be filled in.
        allProjects.filter((p) => (projectId ? p.projectId === projectId : extraIds.includes(p.projectId))),
      ),
    [shown, allProjects, extraIds, projectId],
  );

  if (!start) return <Skeleton className="h-64 w-full" />;
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const refresh = () => utils.entry.list.invalidate();
  const addable = allProjects.filter((p) => !sheet.rows.some((r) => r.projectId === p.projectId));

  async function setCell(projectId: string, date: string, text: string, current: number) {
    const trimmed = text.trim();
    const minutes = trimmed === "" ? 0 : parseDuration(trimmed);
    if (minutes === null || minutes > 24 * 60) {
      toast.error("Couldn't read that duration. Try 8, 7.5 or 6:30.");
      return refresh(); // resets the cell to the saved value
    }
    if (minutes === current) return;
    try {
      await bulk.mutateAsync({ projectId, cells: [{ date, minutes }] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that cell.");
    }
    await refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <ViewTabs current="week" date={today && today >= start && today <= end ? today : start} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-semibold text-xl">Weekly timesheet</h1>
          <p className="text-muted-foreground text-sm">
            {rangeLabel.format(fromISODate(start))} – {rangeLabel.format(fromISODate(end))}
            <span className="max-md:hidden">
              {" "}
              · type hours in any box. The small note icon in a box adds a description, the wand on a project fills
              several days at once, and + on a day adds another entry
            </span>
            <span className="md:hidden"> · tap a day to add or change time</span>
          </p>
        </div>
        <div data-testid="timesheet-toolbar" className="flex flex-wrap items-center gap-1">
          <ProjectFilter
            value={projectId}
            onChange={(id) => {
              setProjectId(id);
              setLastProject(""); // the filter is the project in play now
            }}
          />
          <ShareExportMenu
            entries={entries.data ? shown : undefined}
            days={days}
            filename={`usehourly-${start}_to_${end}.xlsx`}
            period="week"
            defaultFrom={start}
            defaultTo={end}
            projectId={projectId}
          />
          <Button size="icon" variant="outline" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week">
            <ChevronLeft />
          </Button>
          <Button variant="outline" onClick={() => today && setStart(startOfWeek(today))}>
            This week
          </Button>
          <Button size="icon" variant="outline" onClick={() => setStart(addDays(start, 7))} aria-label="Next week">
            <ChevronRight />
          </Button>
        </div>
      </div>

      <DayEditorDialog date={editDate} onClose={() => setEditDate(null)} />

      {entries.error ? (
        <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
          Couldn't load the timesheet: {entries.error.message}
        </p>
      ) : entries.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          {/* Phones: one card per day. Tap a day to open it and add or change time. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {days.map((d) => {
              const lines = sheet.rows.filter((r) => (r.cells[d]?.minutes ?? 0) > 0);
              return (
                <li key={d}>
                  <button
                    type="button"
                    onClick={() => setEditDate(d)}
                    className={`w-full rounded-xl border bg-card p-4 text-left ${d === today ? "ring-2 ring-primary" : ""}`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{longDayLabel.format(fromISODate(d))}</span>
                      <span className="font-medium font-mono tabular-nums">
                        {sheet.dayTotals[d] ? formatDuration(sheet.dayTotals[d]) : "–"}
                      </span>
                    </span>
                    {lines.length === 0 ? (
                      <span className="mt-1 block text-muted-foreground text-sm">Nothing logged. Tap to add time.</span>
                    ) : (
                      <span className="mt-1 block space-y-0.5 text-sm">
                        {lines.map((r) => (
                          <span key={r.projectId} className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                              {r.project} · {r.client}
                            </span>
                            <span className="font-mono tabular-nums">{formatDuration(r.cells[d]?.minutes ?? 0)}</span>
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="mt-2 block text-primary text-sm">Open day</span>
                  </button>
                </li>
              );
            })}
            <li className="flex items-baseline justify-between rounded-xl border bg-muted/40 px-4 py-3 font-medium">
              <span>Week total</span>
              <span className="font-mono tabular-nums">
                {formatDuration(sheet.total)}
                <span className="ml-1 text-muted-foreground text-xs">({formatDecimalHours(sheet.total)} h)</span>
              </span>
            </li>
          </ul>

          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-3 py-2 text-left font-normal">Project</th>
                  {days.map((d) => (
                    <th key={d} className={`px-1 py-2 text-center font-normal ${d === today ? "text-foreground" : ""}`}>
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setEditDate(d)}
                          title="Edit this day"
                          className="rounded px-1 hover:bg-muted hover:underline"
                        >
                          {dayLabel.format(fromISODate(d))}
                        </button>
                        <AddEntryPopover
                          date={d}
                          label={dayLabel.format(fromISODate(d))}
                          projects={allProjects}
                          projectId={
                            lastProject || projectId || sheet.rows[0]?.projectId || allProjects[0]?.projectId || ""
                          }
                          onProjectChange={setLastProject}
                          dayEntries={shown.filter((e) => e.date === d)}
                          onDone={refresh}
                        />
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-normal">Total</th>
                </tr>
              </thead>
              <tbody>
                {sheet.rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                      No time logged this week. Add a project row below to start filling in days.
                    </td>
                  </tr>
                )}
                {sheet.rows.map((r) => (
                  <tr
                    key={r.projectId}
                    className="border-b last:border-0"
                    // Typing in, filling or annotating a row makes it the project the + popover presets.
                    onFocusCapture={() => setLastProject(r.projectId)}
                    onPointerDownCapture={() => setLastProject(r.projectId)}
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <ProjectMark projectId={r.projectId} color={r.color} logos={logos} />
                        {/* Click a row's name to show only that project; click it again to see them all. */}
                        <button
                          type="button"
                          onClick={() => {
                            setProjectId(toggleProjectFilter(projectId, r.projectId));
                            setLastProject("");
                          }}
                          aria-pressed={projectId === r.projectId}
                          title={projectId === r.projectId ? "Show all projects" : `Show only ${r.project}`}
                          className="-mx-1 min-w-0 flex-1 cursor-pointer truncate rounded px-1 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:font-medium"
                        >
                          {r.project} <span className="text-muted-foreground">· {r.client}</span>
                        </button>
                        <FillPopover
                          projectId={r.projectId}
                          label={r.project}
                          days={days}
                          cells={r.cells}
                          onDone={refresh}
                        />
                      </div>
                    </td>
                    {days.map((d) => (
                      <td key={d} className="px-1 py-1.5">
                        <GridCell
                          cell={r.cells[d]}
                          label={`${r.project} ${d}`}
                          projectId={r.projectId}
                          date={d}
                          entry={cellEntries.get(`${r.projectId}|${d}`) ?? null}
                          onNoteSaved={refresh}
                          onOpenDay={() => setEditDate(d)}
                          onCommit={(text) => setCell(r.projectId, d, text, r.cells[d]?.minutes ?? 0)}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-medium font-mono tabular-nums">
                      {formatDuration(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/40 font-medium">
                  <td className="px-3 py-2">Total</td>
                  {days.map((d) => (
                    <td key={d} className="px-1 py-2 text-center font-mono tabular-nums">
                      {sheet.dayTotals[d] ? formatDuration(sheet.dayTotals[d]) : "–"}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">
                    {formatDuration(sheet.total)}
                    <span className="ml-1 text-muted-foreground text-xs">({formatDecimalHours(sheet.total)} h)</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {!projectId && addable.length > 0 && (
        <div className="hidden items-center gap-2 md:flex">
          <Plus className="size-4 text-muted-foreground" />
          <select
            aria-label="Add a project row"
            value=""
            onChange={(e) => e.target.value && setExtraIds((ids) => [...ids, e.target.value])}
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            <option value="">Add a project row…</option>
            {addable.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.client} · {p.project}
              </option>
            ))}
          </select>
        </div>
      )}

      {!entries.isLoading && !entries.error && <MergeDaysPanel entries={shown} />}

      {/* Keyed by week + project so navigating starts on page 1 with a clear search. */}
      {!entries.isLoading && !entries.error && (
        <WorkItems key={`${start}-${projectId}`} entries={shown} onOpenDay={setEditDate} period="week" />
      )}
    </div>
  );
}

/** One editable day cell. Multi-entry or running-timer days stay read-only and link to the day. */
function GridCell({
  cell,
  label,
  projectId,
  date,
  entry,
  onNoteSaved,
  onOpenDay,
  onCommit,
}: {
  cell: Cell | undefined;
  label: string;
  projectId: string;
  date: string;
  entry: CellEntry | null;
  onNoteSaved: () => void;
  onOpenDay: () => void;
  onCommit: (text: string) => void;
}) {
  if (cell && (cell.count > 1 || cell.running)) {
    return (
      <button
        type="button"
        onClick={onOpenDay}
        title={
          cell.running ? "Timer running — click to edit this day" : `${cell.count} entries — click to edit this day`
        }
        className="block w-full rounded-md border border-dashed px-2 py-1 text-right font-mono tabular-nums hover:bg-muted"
      >
        {formatDuration(cell.minutes)}
        {cell.running ? " +" : ""}
      </button>
    );
  }
  const saved = cell?.minutes ? formatDuration(cell.minutes) : "";
  return (
    <div className="relative">
      <Input
        // Re-mount when the saved value changes so refetches replace stale text.
        key={saved}
        defaultValue={saved}
        aria-label={label}
        placeholder="–"
        title={entry?.note || undefined}
        className="h-8 pr-2 pl-6 text-right font-mono tabular-nums"
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            (e.target as HTMLInputElement).value = saved;
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <NotePopover
        // Re-mount with the saved note so a refetch shows the latest text.
        key={`${entry?.id ?? "new"}:${entry?.note ?? ""}`}
        projectId={projectId}
        date={date}
        label={label}
        entry={entry}
        onDone={onNoteSaved}
      />
    </div>
  );
}
