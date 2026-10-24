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
  /** The project picked for it: the person's rule first, else the one the title names clearly, else null. */
  projectId: string | null;
  /** The word of the rule that picked the project, or null when no rule did. */
  rule: string | null;
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

/*
 * Meeting rules (issue 99): "always put 'acme' meetings on Acme / Design". A rule is one word (or a short phrase) and a
 * project; a meeting whose title contains it as whole words gets that project picked, before the guess from names (the
 * rule is the person's own choice). The rules are kept in this browser by `lib/calendar-store.ts`, never on a server.
 */
export type CalendarRule = { word: string; projectId: string };

/** At most this many rules are kept (the oldest are dropped first). */
export const MAX_RULES = 100;
/** A rule's word or phrase is at most this long. */
export const MAX_RULE_CHARS = 60;

/** Words that say nothing about WHO a meeting is for, so a rule is never made from them alone. */
const PLAIN_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "of",
  "for",
  "with",
  "to",
  "on",
  "in",
  "at",
  "by",
  "re",
  "meeting",
  "meetings",
  "call",
  "calls",
  "sync",
  "weekly",
  "daily",
  "monthly",
  "catch",
  "up",
  "catchup",
  "check",
  "checkin",
  "chat",
  "review",
  "planning",
  "plan",
  "kickoff",
  "kick",
  "off",
  "intro",
  "followup",
  "follow",
  "session",
  "standup",
  "stand",
  "team",
  "zoom",
  "teams",
  "meet",
  "google",
  "tbd",
]);

/**
 * The word to offer a rule for, from a meeting's title: the first word of three letters or more that is not a plain
 * meeting word ("Acme weekly sync" gives "acme"). A title made only of plain words gives the whole title ("weekly
 * sync"), so the rule still means one kind of meeting. Null for a title with nothing usable.
 */
export function ruleWordFor(title: string): string | null {
  const parts = words(title).trim().split(" ").filter(Boolean);
  const telling = parts.find((w) => w.length >= 3 && !PLAIN_WORDS.has(w) && !/^\d+$/.test(w));
  if (telling) return telling;
  const whole = parts.join(" ");
  return whole.length >= 3 && whole.length <= MAX_RULE_CHARS && /\p{L}/u.test(whole) ? whole : null;
}

/**
 * The project the person's rules put a meeting on, or null. Only projects in `projectIds` count (a rule for a deleted
 * or archived project is ignored). When several rules match, the longest word wins ("acme design" beats "acme"); between
 * equals, the newest rule (last in the list).
 */
export function ruleProject(
  title: string,
  rules: readonly CalendarRule[],
  projectIds: ReadonlySet<string>,
): CalendarRule | null {
  let best: CalendarRule | null = null;
  for (const r of rules) {
    if (!projectIds.has(r.projectId) || !named(title, r.word)) continue;
    if (!best || r.word.length >= best.word.length) best = r;
  }
  return best;
}

/**
 * Whether to offer "Always put '<word>' meetings on <project>?" after a meeting was added: only when the person chose
 * the project themselves (it is not what was already picked for them) and no rule already puts that word on that
 * project. Returns the word to offer, or null.
 */
export function ruleToOffer(
  title: string,
  chosenProjectId: string,
  prePickedProjectId: string | null,
  rules: readonly CalendarRule[],
): string | null {
  if (!chosenProjectId || chosenProjectId === prePickedProjectId) return null;
  const word = ruleWordFor(title);
  if (!word) return null;
  return rules.some((r) => r.word === word && r.projectId === chosenProjectId) ? null : word;
}

/** The rules with one added: a rule for the same word is replaced, the newest goes last, the oldest drop off past the cap. */
export function addRule(rules: readonly CalendarRule[], rule: CalendarRule): CalendarRule[] {
  const word = words(rule.word).trim().slice(0, MAX_RULE_CHARS);
  if (!word || !rule.projectId) return [...rules];
  return [...rules.filter((r) => r.word !== word), { word, projectId: rule.projectId }].slice(-MAX_RULES);
}

/**
 * The suggestions for one local day (`day` = YYYY-MM-DD in the browser's zone): meetings that START that day, not
 * skipped, not already logged (an entry that day with the same description and length), in time order. The person's
 * meeting rules (issue 99) pick the project before the guess from names does.
 */
export function suggestionsForDay(
  events: readonly CalendarEvent[],
  day: string,
  projects: readonly SuggestProject[],
  logged: readonly { note: string; minutes: number }[],
  skipped: ReadonlySet<string>,
  rules: readonly CalendarRule[] = [],
): Suggestion[] {
  const projectIds = new Set(projects.map((p) => p.id));
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
    const rule = ruleProject(e.title, rules, projectIds);
    out.push({
      id,
      title: e.title,
      minutes,
      start: e.start,
      projectId: rule ? rule.projectId : guessProject(e.title, projects),
      rule: rule ? rule.word : null,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}
