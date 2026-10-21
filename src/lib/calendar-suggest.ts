import type { CalendarEvent } from "@/lib/calendar-events";
import { fromISODate } from "@/lib/dates";

/**
 * Turning a day's meetings into time-entry suggestions (issue #99). Nothing here saves anything: the screen offers each
 * suggestion with Add and Skip, and a person taps.
 */
export type SuggestProject = { id: string; name: string; clientName: string };

export type Suggestion = {
  /** Stable for one occurrence of one event: used to remember "skipped". */
  id: string;
  title: string;
  minutes: number;
  start: number;
  /** The project the title points at, or null when it does not name one clearly. */
  projectId: string | null;
};

/** Meetings longer than this are blocks of time (travel, "out of office"), not something to log from a title. */
export const MAX_SUGGESTED_MINUTES = 8 * 60;

export const eventId = (e: Pick<CalendarEvent, "uid" | "start">) => `${e.uid}@${e.start}`;

const words = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;

/** Whole-word match of a name in a title (names under 3 letters never match: too easy to hit by accident). */
const named = (title: string, name: string) => {
  const n = words(name).trim();
  return n.length >= 3 && words(title).includes(` ${n} `);
};

/** Drops a matched name that is only part of a longer matched name ("app" inside "mobile app"). */
const longestOnly = <T>(hits: { name: string; value: T }[]) =>
  hits.filter(
    (h) => !hits.some((o) => o !== h && words(o.name).includes(words(h.name)) && words(o.name) !== words(h.name)),
  );

/**
 * The project a meeting title names. A project's own name decides; otherwise a client's name decides when that client has
 * one project. If the title names several different projects (or clients), or a client with several projects, it is
 * left for the person to choose: a wrong guess costs more than a tap.
 */
export function guessProject(title: string, projects: readonly SuggestProject[]): string | null {
  const byName = longestOnly(projects.filter((p) => named(title, p.name)).map((p) => ({ name: p.name, value: p.id })));
  const ids = new Set(byName.map((h) => h.value));
  if (ids.size === 1) return [...ids][0];
  if (ids.size > 1) return null;

  const clients = new Map<string, string[]>();
  for (const p of projects) clients.set(p.clientName, [...(clients.get(p.clientName) ?? []), p.id]);
  const byClient = longestOnly(
    [...clients].filter(([name]) => named(title, name)).map(([name, list]) => ({ name, value: list })),
  );
  return byClient.length === 1 && byClient[0].value.length === 1 ? byClient[0].value[0] : null;
}

/**
 * The suggestions for one local day (`day` = YYYY-MM-DD in the browser's zone): meetings that START that day, not
 * skipped, not already logged (an entry that day with the same description and length), in time order.
 */
export function suggestionsForDay(
  events: readonly CalendarEvent[],
  day: string,
  projects: readonly SuggestProject[],
  logged: readonly { note: string; minutes: number }[],
  skipped: ReadonlySet<string>,
): Suggestion[] {
  const from = fromISODate(day).getTime();
  const next = fromISODate(day);
  next.setDate(next.getDate() + 1);
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const e of events) {
    if (e.start < from || e.start >= next.getTime()) continue;
    const id = eventId(e);
    if (seen.has(id) || skipped.has(id)) continue;
    seen.add(id);
    const minutes = Math.max(1, Math.round((e.end - e.start) / 60_000));
    if (minutes > MAX_SUGGESTED_MINUTES) continue;
    if (logged.some((l) => l.minutes === minutes && l.note.trim().toLowerCase() === e.title.trim().toLowerCase()))
      continue;
    out.push({ id, title: e.title, minutes, start: e.start, projectId: guessProject(e.title, projects) });
  }
  return out.sort((a, b) => a.start - b.start);
}
