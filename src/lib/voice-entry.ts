import { parseDuration } from "@/lib/duration";

/**
 * Reads one spoken sentence ("two hours on Northwind, fixing the checkout page") into the Log time card's fields.
 * Pure: no DOM, no network. English only. The words the voice UI shows live here too, so browser tests can import them.
 */

export const VOICE_LISTENING = "Listening… say the time, the project and what you did";
export const VOICE_NO_TIME = "Say or type the hours";
export const VOICE_BLOCKED = "Microphone is blocked. Allow it in your browser's site settings, or type the time.";
export const VOICE_NO_SPEECH = "Didn't catch that. Tap the mic and try again.";
export const VOICE_STOPPED = "Voice input stopped. Tap the mic to try again, or type the time.";

/** The plain words for a speech error code from the browser (`not-allowed`, `no-speech`, ...). */
export function voiceErrorText(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") return VOICE_BLOCKED;
  if (code === "no-speech") return VOICE_NO_SPEECH;
  return VOICE_STOPPED;
}

/** A client as `clients.list` gives it, with only what the parser reads. */
export type VoiceClient = {
  id: string;
  name: string;
  archived?: boolean;
  projects: readonly { id: string; name: string }[];
};

/** What a sentence said. `minutes` is missing when no time was heard; `unknownClient` names a client not in the list. */
export type VoiceEntry = {
  minutes?: number;
  projectId?: string;
  clientName?: string;
  unknownClient?: string;
  note: string;
};

type Token = { raw: string; word: string };
type Span = { start: number; end: number };

const NUMBER_WORDS: Record<string, string> = {
  a: "1",
  an: "1",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
};
const HOUR = /^(hours?|hrs?)$/;
const MINUTE = /^(minutes?|mins?)$/;
/** A numeric time that already says its unit: "2h", "1.5h", "1h30", "90m", "1:30". */
const NUMERIC_TIME = /^\d+(?:[.,]\d+)?h|^\d+m(?:ins?)?$|^\d+:\d{2}$/;
const HINTS = new Set(["on", "for"]);
/** Skipped right after "on" / "for": "on the Northwind site" still points at Northwind. */
const HINT_SKIP = new Set(["the", "my"]);
/** Words that never start a client or project name, so "on the weekend" is not read as a client called "the". */
const FILLER = new Set(["the", "a", "an", "my", "our", "some", "and", "of", "to", "in", "at", "with", "on", "for"]);

function tokenize(text: string): Token[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, word: raw.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "") }));
}

/** A number at `i` ("two", "2", "1.5"), as digits for `parseDuration`. */
function numberAt(words: string[], i: number): string | undefined {
  const w = words[i] ?? "";
  return /^\d+(?:[.,]\d+)?$/.test(w) ? w : NUMBER_WORDS[w];
}

const isHour = (w = "") => HOUR.test(w);
const isArticle = (w = "") => w === "a" || w === "an";
const isAndAHalf = (words: string[], i: number) =>
  words[i] === "and" && words[i + 1] === "a" && words[i + 2] === "half";

/** "half an hour", "half hour", "a half hour": 30 minutes, and the number of words. */
function halfHourAt(words: string[], i: number): number {
  if (words[i] === "half" && isHour(words[i + 1])) return 2;
  if (words[i] === "half" && isArticle(words[i + 1]) && isHour(words[i + 2])) return 3;
  if (isArticle(words[i]) && words[i + 1] === "half" && isHour(words[i + 2])) return 3;
  return 0;
}

/**
 * The spoken time that starts at word `i`, as text `parseDuration` reads ("2h", "1.5h", "2h30m", "30m") and the number
 * of words it took, or undefined when no time starts there.
 */
function timeTextAt(words: string[], i: number): { text: string; length: number } | undefined {
  const half = halfHourAt(words, i);
  if (half) return { text: "30m", length: half };
  if (NUMERIC_TIME.test(words[i] ?? "")) return { text: words[i], length: 1 };
  const n = numberAt(words, i);
  if (n === undefined) return undefined;
  if (isAndAHalf(words, i + 1) && isHour(words[i + 4])) return { text: `${n}.5h`, length: 5 };
  if (MINUTE.test(words[i + 1] ?? "")) return { text: `${n}m`, length: 2 };
  if (!isHour(words[i + 1])) return undefined;
  if (isAndAHalf(words, i + 2)) return { text: `${n}.5h`, length: 5 };
  const andSkip = words[i + 2] === "and" ? 1 : 0;
  const m = numberAt(words, i + 2 + andSkip);
  if (m !== undefined && MINUTE.test(words[i + 3 + andSkip] ?? "")) return { text: `${n}h${m}m`, length: 4 + andSkip };
  return { text: `${n}h`, length: 2 };
}

/** The first time said in the sentence, in whole minutes, and the words it took. */
function findTime(words: string[]): { minutes: number; span: Span } | undefined {
  for (let i = 0; i < words.length; i++) {
    const found = timeTextAt(words, i);
    const minutes = found ? parseDuration(found.text) : null;
    if (found && minutes !== null) return { minutes, span: { start: i, end: i + found.length } };
  }
  return undefined;
}

const nameWords = (name: string) =>
  name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

type Candidate = { clientId: string; projectId?: string };
/** The best match and the words it took; `isTie` when two different clients matched equally well. */
type Match = Candidate & { span: Span; score: number; isTie: boolean };

/**
 * How well the words from `start` match a name: the count of whole words matched from the name's start (so
 * "Northwind" matches "Northwind Bakery"), doubled, plus one when the whole name was said. 0 is no match. A name that
 * starts with a filler word ("The Agency") needs one more word than that.
 */
function matchScore(words: string[], used: Set<number>, start: number, name: string): number {
  const parts = nameWords(name);
  let k = 0;
  while (k < parts.length && !used.has(start + k) && words[start + k] === parts[k]) k++;
  if (k === 0 || (FILLER.has(parts[0]) && k < 2)) return 0;
  return k * 2 + (k === parts.length ? 1 : 0);
}

/** The best match among `named` at the given start positions, or undefined when nothing matches. */
function bestMatch(ctx: Context, starts: number[], named: { name: string; candidate: Candidate }[]): Match | undefined {
  let best: Match | undefined;
  for (const start of starts) {
    for (const { name, candidate } of named) {
      const score = matchScore(ctx.words, ctx.used, start, name);
      if (score === 0 || (best && score < best.score)) continue;
      if (best && score === best.score) {
        if (candidate.clientId !== best.clientId) best.isTie = true;
        continue;
      }
      best = { ...candidate, span: { start, end: start + Math.floor(score / 2) }, score, isTie: false };
    }
  }
  return best;
}

/**
 * The project to log to for a client: its only project; with several, the remembered last project when it is this
 * client's, else the client's first. Undefined for a client with no project.
 */
export function projectForClient(client: VoiceClient, lastProjectId?: string): string | undefined {
  if (client.projects.length <= 1) return client.projects[0]?.id;
  return client.projects.some((p) => p.id === lastProjectId) ? lastProjectId : client.projects[0].id;
}

type Context = { words: string[]; used: Set<number>; clients: VoiceClient[] };

/** Project names are tried first (a project match wins), then client names. */
function matchAt(ctx: Context, starts: number[]): Match | undefined {
  const projects = ctx.clients.flatMap((c) =>
    c.projects.map((p) => ({ name: p.name, candidate: { clientId: c.id, projectId: p.id } })),
  );
  const clients = ctx.clients.map((c) => ({ name: c.name, candidate: { clientId: c.id } }));
  return bestMatch(ctx, starts, projects) ?? bestMatch(ctx, starts, clients);
}

/** The word after each "on" / "for" (past a "the" or "my"): where a hinted name starts. */
function hintedStarts(ctx: Context): number[] {
  const starts: number[] = [];
  ctx.words.forEach((w, i) => {
    if (!HINTS.has(w) || ctx.used.has(i)) return;
    const next = HINT_SKIP.has(ctx.words[i + 1]) ? i + 2 : i + 1;
    if (next < ctx.words.length && !ctx.used.has(next) && !FILLER.has(ctx.words[next])) starts.push(next);
  });
  return starts;
}

/** The heard name after a hint that matched nothing: one word, or up to three when the next ones are capitalised. */
function heardName(tokens: Token[], used: Set<number>, start: number): Span {
  let end = start + 1;
  while (
    end < Math.min(tokens.length, start + 3) &&
    !used.has(end) &&
    !/[,.;:!?]$/.test(tokens[end - 1].raw) &&
    /^\p{Lu}/u.test(tokens[end].raw)
  )
    end++;
  return { start, end };
}

/** The heard words of a span, without the punctuation after each ("Zephyr," is "Zephyr"). */
const spokenWords = (tokens: Token[], span: Span) =>
  tokens
    .slice(span.start, span.end)
    .map((t) => t.raw.replace(/[^\p{L}\p{N}&'-]+$/u, ""))
    .join(" ");

/** The words left once the time and the name are taken out: no leading or trailing "on", "for", "and" or comma. */
function noteFrom(tokens: Token[], used: Set<number>): string {
  const rest = tokens
    .filter((_, i) => !used.has(i))
    .map((t) => t.raw)
    .join(" ")
    .replace(/^(?:[\s,;:.–-]|(?:on|for|and)\b)+/i, "")
    .replace(/(?:[\s,;:–-]|\b(?:on|for|and))+$/i, "")
    .trim();
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** Marks a name's words as taken, with the "on" / "for" (and a "the" after it) right before it. */
function takeName(words: string[], used: Set<number>, span: Span) {
  for (let i = span.start; i < span.end; i++) used.add(i);
  const hint = span.start - 1 - (HINT_SKIP.has(words[span.start - 1]) ? 1 : 0);
  if (!HINTS.has(words[hint])) return;
  for (let i = hint; i < span.start; i++) used.add(i);
}

/**
 * Reads a spoken sentence into a Log time entry: `minutes` (whole minutes, through `parseDuration`), the project to log
 * to (matched against the user's own non-archived clients and projects; "on X" / "for X" mark the name), and the rest
 * as the note. A hinted name that matches nothing, or a name two clients match equally well, comes back as
 * `unknownClient` and no project. `lastProjectId` is the remembered `hourly:lastProject`, for a client with several
 * projects. Never throws.
 */
export function parseVoiceEntry(
  text: string,
  { clients, lastProjectId }: { clients: readonly VoiceClient[]; lastProjectId?: string },
): VoiceEntry {
  const tokens = tokenize(text);
  const words = tokens.map((t) => t.word);
  const used = new Set<number>();
  const time = findTime(words);
  if (time) for (let i = time.span.start; i < time.span.end; i++) used.add(i);

  const ctx: Context = { words, used, clients: clients.filter((c) => !c.archived && c.projects.length > 0) };
  const hinted = hintedStarts(ctx);
  // With an "on" / "for", only the hinted name counts: "on Zephyr, design" is about Zephyr, not a project "Design".
  const match = matchAt(ctx, hinted.length > 0 ? hinted : words.map((_, i) => i));
  const entry: VoiceEntry = { minutes: time?.minutes, note: "" };
  if (match) takeName(words, used, match.span);
  if (match && !match.isTie) {
    const client = ctx.clients.find((c) => c.id === match.clientId);
    entry.clientName = client?.name;
    entry.projectId = match.projectId ?? (client && projectForClient(client, lastProjectId));
  } else if (match) {
    // Two clients match equally well: never guess between them (money), ask with the not-found chips.
    entry.unknownClient = spokenWords(tokens, match.span);
  } else if (hinted.length > 0) {
    const span = heardName(tokens, used, hinted[0]);
    takeName(words, used, span);
    entry.unknownClient = spokenWords(tokens, span);
  }
  entry.note = noteFrom(tokens, used);
  return entry;
}

/** Edit distance between two short names (letters added, removed or changed). */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

/** Up to `count` of the user's clients (not archived, with a project) whose names are closest to a heard name. */
export function closestClients(heard: string, clients: readonly VoiceClient[], count = 3): VoiceClient[] {
  const said = heard.toLowerCase();
  const near = (c: VoiceClient) =>
    Math.min(distance(said, c.name.toLowerCase()), ...nameWords(c.name).map((w) => distance(said, w)));
  return clients
    .filter((c) => !c.archived && c.projects.length > 0)
    .map((client) => ({ client, away: near(client) }))
    .sort((x, y) => x.away - y.away || x.client.name.localeCompare(y.client.name))
    .slice(0, count)
    .map(({ client }) => client);
}
