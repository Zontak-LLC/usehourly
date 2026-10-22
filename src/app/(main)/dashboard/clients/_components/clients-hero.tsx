"use client";

import { Dial } from "@/components/day-dial";
import { formatDuration } from "@/lib/duration";

import type { ClientRow, ProjectTotals } from "./client-types";

const MONTH_GOAL_MINUTES = 160 * 60;
const MAX_TILES = 6;

/** This month as a dial, beside one tile per client (biggest first): its hours, its share of the month and its projects. */
export function ClientsHero({
  clients,
  totals,
  monthMinutes,
}: {
  clients: ClientRow[];
  totals: ProjectTotals;
  monthMinutes: number;
}) {
  const rows = clients
    .map((c) => ({ c, minutes: c.projects.reduce((sum, p) => sum + (totals[p.id]?.range ?? 0), 0) }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, MAX_TILES);
  const cols =
    rows.length === 1 ? "sm:grid-cols-1" : rows.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3";
  const projectCount = clients.reduce((n, c) => n + c.projects.length, 0);
  return (
    <section
      aria-label="This month"
      data-headerless="the month at a glance, above the list"
      className="grid items-stretch gap-4 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]"
    >
      <Dial
        label="This month"
        title="Logged"
        minutes={monthMinutes}
        goal={MONTH_GOAL_MINUTES}
        footLeft="Goal 160 h"
        footRight={`${clients.length} clients · ${projectCount} projects`}
      />
      <ul className={`grid auto-rows-fr grid-cols-1 gap-3 ${cols}`}>
        {rows.map(({ c, minutes }) => (
          <li
            key={c.id}
            className="flex flex-col justify-between gap-3 rounded-3xl bg-card p-4 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10"
            style={{ borderTop: `3px solid ${c.color ?? "var(--amber)"}` }}
          >
            <p className="flex items-center gap-2 truncate font-display font-extrabold text-lg leading-tight">
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-full"
                style={{ background: c.color ?? "var(--amber)" }}
              />
              <span className="truncate">{c.name}</span>
            </p>
            <div>
              <p className="font-display font-extrabold text-3xl tabular-nums leading-none">
                {formatDuration(minutes)}
              </p>
              <p className="mt-1 font-mono text-[11px] text-foreground/75 uppercase tracking-widest">
                {c.projects.length} project{c.projects.length === 1 ? "" : "s"} · this month
              </p>
            </div>
            <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{
                  width: `${(minutes / Math.max(1, monthMinutes)) * 100}%`,
                  background: c.color ?? "var(--amber)",
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
