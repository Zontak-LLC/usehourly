"use client";

import { Dial } from "@/components/day-dial";
import { StatTile, TileRing } from "@/components/stat-tile";
import { formatDuration } from "@/lib/duration";

import type { ClientRow, ProjectTotals } from "./client-types";

const MONTH_GOAL_MINUTES = 160 * 60;
const MAX_TILES = 4;

/** This month as a dial, beside one tile per client (biggest first): its hours, its share of the month and its projects. */
/** The month dial blends ultramarine, a hot pink and an ultraviolet (the day dial on Today keeps the brand blend). */
const MONTH_RING = ["#3d5afe", "#ff4d8d", "#a64dff"] as const;

export function ClientsHero({
  clients,
  totals,
  monthMinutes,
}: {
  clients: ClientRow[];
  totals: ProjectTotals;
  monthMinutes: number;
}) {
  const all = clients
    .map((c) => ({ c, minutes: c.projects.reduce((sum, p) => sum + (totals[p.id]?.range ?? 0), 0) }))
    .sort((a, b) => b.minutes - a.minutes);
  // Four tiles at most, so the block keeps one size with ten clients as with three: the top clients, then everyone else in one.
  const rows = all.length > MAX_TILES ? all.slice(0, MAX_TILES - 1) : all;
  const rest = all.length > MAX_TILES ? all.slice(MAX_TILES - 1) : [];
  const restMinutes = rest.reduce((sum, r) => sum + r.minutes, 0);
  const tiles = rows.length + (rest.length ? 1 : 0);
  // Up to three tiles are rows stacked beside the dial (each fills its row, names are never cut off); four make a 2 by 2.
  const cols = tiles <= 3 ? "" : "sm:grid-cols-2";
  const projectCount = clients.reduce((n, c) => n + c.projects.length, 0);
  return (
    <section
      aria-label="This month"
      data-headerless="the month at a glance, above the list"
      className="grid items-stretch gap-4 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]"
    >
      <Dial
        label="This month"
        ring={MONTH_RING}
        title="Logged"
        minutes={monthMinutes}
        goal={MONTH_GOAL_MINUTES}
        footLeft="Goal 160 h"
        footRight={`${clients.length} client${clients.length === 1 ? "" : "s"} · ${projectCount} project${projectCount === 1 ? "" : "s"}`}
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
            <TileRing
              fraction={monthMinutes ? minutes / monthMinutes : 0}
              label={`${c.name}'s share of the month`}
              colour={c.color ?? MONTH_RING[0]}
            />
          </StatTile>
        ))}
        {rest.length > 0 && (
          <StatTile
            label={`${rest.length} other clients · listed below`}
            value={restMinutes}
            display={formatDuration}
            title={<span className="truncate">Everyone else</span>}
          >
            <TileRing
              fraction={monthMinutes ? restMinutes / monthMinutes : 0}
              label="Share of the month from the other clients"
              colour={MONTH_RING[0]}
            />
          </StatTile>
        )}
      </div>
    </section>
  );
}
