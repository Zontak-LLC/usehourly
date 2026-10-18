import { TRPCError } from "@trpc/server";

import { parseDuration } from "@/lib/duration";

import { hours } from "./format";

export type EntryRow = {
  id: string;
  date: string;
  minutes: number;
  note: string;
  started_at: Date | null;
  project: { id: string; name: string; client: { id: string; name: string } };
};

export function shapeEntry(e: EntryRow) {
  return {
    id: e.id,
    date: e.date,
    minutes: e.minutes,
    hours: hours(e.minutes),
    note: e.note,
    running: Boolean(e.started_at),
    started_at: e.started_at ? e.started_at.toISOString() : null,
    project: { id: e.project.id, name: e.project.name },
    client: { id: e.project.client.id, name: e.project.client.name },
  };
}

export function summarize(entries: EntryRow[]) {
  const total = entries.reduce((n, e) => n + e.minutes, 0);
  const byProject = new Map<string, { project: string; client: string; minutes: number }>();
  const byDate = new Map<string, number>();
  for (const e of entries) {
    const k = e.project.id;
    const cur = byProject.get(k) ?? { project: e.project.name, client: e.project.client.name, minutes: 0 };
    cur.minutes += e.minutes;
    byProject.set(k, cur);
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.minutes);
  }
  return {
    total_minutes: total,
    total_hours: hours(total),
    by_project: [...byProject.values()]
      .sort((a, b) => b.minutes - a.minutes)
      .map((p) => ({ ...p, hours: hours(p.minutes) })),
    by_date: [...byDate.entries()].sort().map(([d, m]) => ({ date: d, minutes: m, hours: hours(m) })),
  };
}

export function minutesFromArgs(a: { minutes?: number; duration?: string }): number | undefined {
  if (a.minutes !== undefined) return a.minutes;
  if (a.duration === undefined) return undefined;
  const m = parseDuration(a.duration);
  if (!m || m < 1 || m > 1440) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Couldn't read that duration. Try 1.5, 1:30 or 90m." });
  }
  return m;
}

export const needsDuration = (v: { minutes?: number; duration?: string }) =>
  v.minutes !== undefined || v.duration !== undefined;
