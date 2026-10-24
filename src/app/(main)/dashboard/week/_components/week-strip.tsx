"use client";

import { useEffect, useState } from "react";

import { ListSearch } from "@/components/list-search";
import { Pagination } from "@/components/pagination";
import { toggleProjectFilter } from "@/components/project-filter";
import { SIDE_CARD, SideScroll } from "@/components/side-column";
import { usePageSize } from "@/components/use-page-size";
import { formatDuration } from "@/lib/duration";
import { ROW_FIGURE } from "@/lib/figures";
import { matchesAll } from "@/lib/global-search";
import { paginate } from "@/lib/paginate";
import type { buildSheet } from "@/lib/timesheet";

export const longDayLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

type Sheet = ReturnType<typeof buildSheet>;

/** The search box shows once a week has more projects than this (the owner, 2026-10-24: finding one of 20 by scrolling). */
export const PROJECT_SEARCH_FROM = 9;

/** By project's order: by project name, then client (so the three "Maintenance" projects sit together, told apart by client). */
export function byName(a: { project: string; client: string }, b: { project: string; client: string }) {
  return a.project.localeCompare(b.project) || a.client.localeCompare(b.client);
}

/**
 * The week at a glance: the week's hours (2026-10-23, issue 218: no progress line against 40 hours, a goal nobody set), then
 * one row per project; a row filters the whole page when pressed. Every project stays listed while one is picked (the others
 * dimmed), so pressing the picked one again, another one, or "Show all" goes back.
 */
export function WeekTotalCard({
  sheet,
  weekMinutes,
  projectId,
  onProjectId,
}: {
  sheet: Sheet;
  /** The whole week, whatever project is picked: the total and the rows are the week's; the picked row is tinted. */
  weekMinutes: number;
  projectId: string;
  onProjectId: (id: string) => void;
}) {
  const longest = Math.max(1, ...sheet.rows.map((x) => x.total));
  // A-Z, searchable from 9 projects, pages of 10 on a wide screen and one scrolling list on a phone (the owner,
  // 2026-10-24). A picked project's page opens with it.
  const [q, setQ] = useState("");
  const sorted = [...sheet.rows].sort(byName);
  const shown = q.trim() ? sorted.filter((r) => matchesAll(q, `${r.project} ${r.client}`)) : sorted;
  const size = usePageSize(Number.POSITIVE_INFINITY); // a phone scrolls the whole list
  const [pageNo, setPageNo] = useState(1);
  useEffect(() => {
    const at = [...sheet.rows].sort(byName).findIndex((r) => r.projectId === projectId);
    if (at >= 0) setPageNo(Math.floor(at / size) + 1);
  }, [projectId, sheet.rows, size]);
  const view = paginate(shown, pageNo, size);
  return (
    <section
      aria-label="This week"
      data-headerless="a summary list beside the day"
      className={`${SIDE_CARD} overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-sheet)]`}
    >
      <p className="px-4 pt-4 text-sm">
        <span className="font-bold font-display text-2xl tabular-nums">{formatDuration(weekMinutes)}</span>{" "}
        <span className="text-muted-foreground">this week</span>
      </p>
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="font-mono font-normal text-[11px] text-muted-foreground uppercase tracking-widest">
          By project · {formatDuration(sheet.total)}
        </h2>
        {/* With a project picked, the other rows stay (dimmed) and this is the plain way back. */}
        {projectId && (
          <button
            type="button"
            onClick={() => onProjectId("")}
            className="-my-2 min-h-8 rounded-full px-2 font-medium text-foreground text-xs hover:bg-muted"
          >
            Show all
          </button>
        )}
      </div>
      {sheet.rows.length >= PROJECT_SEARCH_FROM && (
        <ListSearch
          label="Search projects"
          value={q}
          onChange={(v) => {
            setQ(v);
            setPageNo(1);
          }}
          className="px-3 pb-2"
        />
      )}
      {sheet.rows.length > 0 && shown.length === 0 && (
        <p className="px-4 pb-4 text-muted-foreground text-sm">No project matches that.</p>
      )}
      {sheet.rows.length === 0 ? (
        <p className="px-4 pb-4 text-muted-foreground text-sm">No entries this week yet.</p>
      ) : (
        <SideScroll>
          <ul className="divide-y border-t">
            {view.items.map((r) => {
              const on = projectId === r.projectId;
              return (
                <li key={r.projectId}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onProjectId(toggleProjectFilter(projectId, r.projectId))}
                    title={on ? "Show all projects" : `Show only ${r.project}`}
                    className={`flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-muted ${
                      on ? "bg-tint" : projectId ? "text-muted-foreground" : ""
                    }`}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        <span className="font-medium">{r.project}</span>
                        <span className="text-muted-foreground"> · {r.client}</span>
                      </span>
                      <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${(r.total / longest) * 100}%`,
                            backgroundColor: "color-mix(in oklab, var(--foreground) 38%, transparent)",
                          }}
                        />
                      </span>
                    </span>
                    <span className={`shrink-0 ${ROW_FIGURE}`}>{formatDuration(r.total)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </SideScroll>
      )}
      {view.pages > 1 && (
        <div className="border-t px-4 py-2">
          <Pagination page={view} noun="projects" onPage={setPageNo} compact />
        </div>
      )}
    </section>
  );
}
