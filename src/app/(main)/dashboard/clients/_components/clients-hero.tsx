"use client";

import { Dial } from "@/components/day-dial";
import { StatTile, TileRing } from "@/components/stat-tile";
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
    rows.length === 1
      ? "sm:grid-cols-1"
      : rows.length === 2
        ? "sm:grid-cols-2"
        : rows.length === 3
          ? "xl:grid-cols-3"
          : "sm:grid-cols-2 xl:grid-cols-3";
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
      <div className={`grid auto-rows-fr grid-cols-1 gap-3 ${cols}`}>
        {rows.map(({ c, minutes }) => (
          <StatTile
            key={c.id}
            label={`${c.projects.length} project${c.projects.length === 1 ? "" : "s"} · this month`}
            value={minutes}
            display={formatDuration}
            accent={c.color ?? "var(--amber)"}
            title={
              <>
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: c.color ?? "var(--amber)" }}
                />
                <span className="truncate">{c.name}</span>
              </>
            }
          >
            <TileRing fraction={monthMinutes ? minutes / monthMinutes : 0} label={`${c.name}'s share of the month`} />
          </StatTile>
        ))}
      </div>
    </section>
  );
}
