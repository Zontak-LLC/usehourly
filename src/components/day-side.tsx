"use client";

import { useEffect, useState } from "react";

import { addDays } from "@/lib/dates";
import { DAY_COLORS, TODAY_COLOR } from "@/lib/day-colors";
import { formatDuration } from "@/lib/duration";

type Entry = {
  date: string;
  minutes: number;
  project_id: string;
  project: { name: string; client: { color: string } };
};

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Under the dial: where today's hours went (a coloured row per project with a bar) and the week as seven small bars,
 * each day in its own colour, today's letter on a pill of that colour. A bar is a button: it opens that day. Both draw in from empty on first show.
 */
export function DaySide({
  entries,
  weekStart,
  date,
  today,
  onPick,
  row = false,
}: {
  /** Every entry of the week. */
  entries: Entry[];
  weekStart: string;
  date: string;
  today: string | null;
  onPick: (d: string) => void;
  /** From a wide screen up the two cards sit side by side (a band across the page) instead of one under the other. */
  row?: boolean;
}) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const perDay = (d: string) => entries.filter((e) => e.date === d).reduce((s, e) => s + e.minutes, 0);
  const scale = Math.max(480, ...days.map(perDay));
  const byProject = new Map<string, { name: string; color: string; minutes: number }>();
  for (const e of entries) {
    if (e.date !== date) continue;
    const row = byProject.get(e.project_id) ?? { name: e.project.name, color: e.project.client.color, minutes: 0 };
    row.minutes += e.minutes;
    byProject.set(e.project_id, row);
  }
  const rows = [...byProject.values()].sort((a, b) => b.minutes - a.minutes);
  const longest = Math.max(1, ...rows.map((r) => r.minutes));

  return (
    <div className={row ? "grid gap-4 md:grid-cols-2" : "flex flex-1 flex-col gap-4"}>
      {rows.length > 0 && (
        <section aria-label="Today by project" className="rounded-3xl border bg-card p-4">
          <h2 className="mb-3 font-mono font-normal text-[11px] text-muted-foreground uppercase tracking-widest">
            By project
          </h2>
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li
                key={r.name}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-sm"
              >
                <span className="size-2.5 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
                <span className="truncate font-medium">{r.name}</span>
                <span className="font-mono tabular-nums">{formatDuration(r.minutes)}</span>
                <span aria-hidden className="col-span-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: grown ? `${(r.minutes / longest) * 100}%` : "0%",
                      backgroundColor: "color-mix(in oklab, var(--foreground) 45%, transparent)",
                      transition: "width 1s cubic-bezier(.2,.8,.2,1)",
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="This week" className="flex flex-1 flex-col rounded-3xl border bg-card p-4 md:max-h-[26rem]">
        <h2 className="mb-3 font-mono font-normal text-[11px] text-muted-foreground uppercase tracking-widest">
          This week
        </h2>
        <div className="grid flex-1 grid-cols-7 gap-2">
          {days.map((d, i) => {
            const total = perDay(d);
            const isToday = d === today;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onPick(d)}
                aria-label={`${d}: ${total ? formatDuration(total) : "nothing logged"}`}
                aria-current={d === date ? "date" : undefined}
                className="group flex h-full flex-col items-center gap-1 rounded-lg py-1 focus-visible:outline-2"
              >
                <span className="flex min-h-28 w-full flex-1 items-end justify-center rounded-lg bg-muted/60 px-1 group-hover:bg-muted">
                  <span
                    data-testid="day-bar"
                    className="block w-full rounded-sm"
                    style={{
                      height: grown ? `${Math.max(total ? 3 : 0, (total / scale) * 100)}%` : "0%",
                      backgroundColor: isToday ? TODAY_COLOR : DAY_COLORS[i],
                      transition: "height .9s cubic-bezier(.2,.8,.2,1)",
                    }}
                  />
                </span>
                <span
                  style={isToday ? { backgroundColor: TODAY_COLOR } : undefined}
                  className={`font-mono text-[11px] ${
                    isToday
                      ? "rounded-full px-1.5 font-semibold text-[#1b1405]"
                      : d === date
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {LETTERS[i]}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  {total ? formatDuration(total) : "–"}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
