"use client";

import { EntryRow } from "@/app/(main)/dashboard/today/_components/entry-row";
import { HoursChip } from "@/components/hours-chip";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import type { SheetEntry } from "@/lib/timesheet";
import type { ProjectGroup } from "@/lib/work-items";

export type WorkFilterProject = { projectId: string; project: string; client: string; color: string; total: number };

/** A bar of chips, one per project with its hours: "All" plus each project. A chosen chip narrows the list and the page. */
export function WorkFilter({
  projects,
  projectId,
  onProjectId,
}: {
  projects: WorkFilterProject[];
  projectId: string;
  onProjectId: (id: string) => void;
}) {
  const chip = (on: boolean) =>
    `inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-sm ring-1 transition-colors ${
      on ? "bg-foreground/10 font-semibold ring-2 ring-amber" : "bg-card ring-foreground/15 hover:bg-muted"
    }`;
  return (
    <fieldset
      aria-label="Filter by project"
      className="m-0 -mx-1 flex gap-2 overflow-x-auto border-0 px-1 py-1.5 [scrollbar-width:thin]"
    >
      <button
        type="button"
        aria-pressed={projectId === ""}
        onClick={() => onProjectId("")}
        className={chip(projectId === "")}
      >
        All projects
      </button>
      {projects.map((p) => {
        const on = p.projectId === projectId;
        return (
          <button
            key={p.projectId}
            type="button"
            aria-pressed={on}
            onClick={() => onProjectId(on ? "" : p.projectId)}
            className={chip(on)}
          >
            <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.project}
            <span className="font-mono text-foreground/70 text-xs tabular-nums">{formatDuration(p.total)}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

/** The switch between the two ways to read the list: by day or by project. */
export function WorkModeSwitch({
  mode,
  onMode,
}: {
  mode: "day" | "project";
  onMode: (mode: "day" | "project") => void;
}) {
  return (
    <fieldset aria-label="Group the list" className="m-0 flex gap-1 rounded-full border-0 bg-muted p-1">
      {(
        [
          ["day", "By day"],
          ["project", "By project"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={mode === id}
          onClick={() => onMode(id)}
          className={`min-h-9 rounded-full px-4 font-semibold text-sm transition-colors ${
            mode === id ? "bg-amber text-[#1b1405]" : "text-foreground/75 hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}

/** The list grouped by project: each project with its total, then its entries newest first, each row starting with its day. */
export function ProjectGroups({
  groups,
  editInPlace,
  editing,
  onEditDone,
}: {
  groups: ProjectGroup<SheetEntry>[];
  editInPlace: boolean;
  editing: ReadonlySet<string>;
  onEditDone: (id: string) => void;
}) {
  return groups.map((g) => (
    <section key={g.projectId} aria-label={`${g.project} · ${g.client}`} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <h3 className="flex min-w-0 items-center gap-2 font-medium text-sm">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
          <span className="truncate">
            {g.project} <span className="font-normal text-muted-foreground">· {g.client}</span>
          </span>
        </h3>
        <HoursChip label="Total">{formatDuration(g.minutes)}</HoursChip>
      </div>
      <ul className="divide-y divide-foreground/10">
        {g.items.map((e) => (
          <EntryRow
            key={`${e.id}-${editInPlace && editing.has(e.id) ? "edit" : "view"}`}
            entry={e}
            bare
            lead="date"
            initialEditing={editInPlace && editing.has(e.id)}
            onEditDone={() => onEditDone(e.id)}
          />
        ))}
      </ul>
    </section>
  ));
}

/** The bar above the list: the By day / By project switch, a line saying the order, and the project chips when there are several. */
export function WorkToolbar({
  mode,
  onMode,
  projects,
  projectId,
  onProjectId,
}: {
  mode: "day" | "project";
  onMode: (mode: "day" | "project") => void;
  projects?: WorkFilterProject[];
  projectId: string;
  onProjectId?: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4 border-b px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <WorkModeSwitch mode={mode} onMode={onMode} />
        <p className="text-muted-foreground text-xs">
          {mode === "day" ? "Newest day first." : "The project with the most time first."}
        </p>
      </div>
      {projects && projects.length > 1 && onProjectId && (
        <WorkFilter projects={projects} projectId={projectId} onProjectId={onProjectId} />
      )}
    </div>
  );
}

const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: "short" });

/** A small calendar leaf: weekday, a big day number, month. It stays in view while the day's rows scroll past. */
export function DateBlock({ date }: { date: string }) {
  const d = fromISODate(date);
  return (
    <div aria-hidden className="self-start">
      <div className="sticky top-32 flex flex-col items-center rounded-2xl bg-muted py-2 text-center ring-1 ring-foreground/10">
        <span className="font-mono text-[10px] text-foreground/70 uppercase tracking-widest">
          {weekdayFmt.format(d)}
        </span>
        <span className="font-display font-extrabold text-2xl tabular-nums leading-none">{d.getDate()}</span>
        <span className="font-mono text-[10px] text-foreground/70 uppercase tracking-widest">{monthFmt.format(d)}</span>
      </div>
    </div>
  );
}
