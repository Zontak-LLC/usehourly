/** The words a time field shows when it cannot log what was typed. Shared by the forms, the server and the tests. */
export const DURATION_UNREADABLE = "Couldn't read that duration. Try 1.5, 1:30 or 90m.";
export const DURATION_NOT_POSITIVE = "Enter more than 0, like 1:30";
export const DURATION_TOO_LONG = "One entry can be up to 24 hours.";
/** "25" is too many hours for one entry, so it was most likely meant as minutes. */
export function minutesHint(n: number): string {
  return `Did you mean ${n} minutes? Type ${n}m`;
}
/** One entry is at most a day. */
export const MAX_ENTRY_MINUTES = 24 * 60;

export type DurationRead = { minutes: number } | { error: string };

/**
 * Read free-form duration text as whole minutes, or say in plain words why it cannot be logged.
 *   "1.5" / "1,5" → 90   "1:30" → 90   "90m" → 90   "2h" → 120   "1h30" / "1h 30m" → 90
 *   a bare number up to 24 is hours ("2" → 120, "13" → 780); minutes need m ("45m"). Issue 435: a bare "2" once
 *   logged two minutes, so a bare number over 24 is refused with a hint instead of guessed.
 */
export function readDuration(input: string): DurationRead {
  const s = decimalComma(input.trim().toLowerCase().replace(/\s+/g, ""));
  const read = readMinutes(s);
  if (read === null) return { error: DURATION_UNREADABLE };
  if (typeof read !== "number") return read;
  return read > 0 ? { minutes: read } : { error: DURATION_NOT_POSITIVE };
}

/** Whole minutes, or null when the text cannot be logged (see `readDuration` for the words why). */
export function parseDuration(input: string): number | null {
  const read = readDuration(input);
  return "minutes" in read ? read.minutes : null;
}

/**
 * The minutes of one entry, given as whole minutes or as text, inside one entry's limit (1 minute to 24 hours).
 * The routers, local sync and the MCP tools refuse with its words.
 */
export function entryMinutes(input: { minutes?: number | null; duration?: string | null }): DurationRead {
  const read = input.minutes != null ? { minutes: input.minutes } : readDuration(input.duration ?? "");
  if ("error" in read) return read;
  if (!Number.isInteger(read.minutes)) return { error: DURATION_UNREADABLE };
  if (read.minutes < 1) return { error: DURATION_NOT_POSITIVE };
  if (read.minutes > MAX_ENTRY_MINUTES) return { error: DURATION_TOO_LONG };
  return read;
}

/** "1,5" → "1.5", "1,5h" → "1.5h". Only one comma with one or two digits after it: "1,000" is a thousands mark, not an hour. */
function decimalComma(s: string): string {
  if (s.split(",").length !== 2) return s;
  return s.replace(/^(\d+),(\d{1,2})(?!\d)/, "$1.$2");
}

/** Minutes (0 or less included), a refusal with its own words, or null for text that cannot be read. */
function readMinutes(s: string): number | { error: string } | null {
  if (!s) return null;

  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) {
    const mins = Number(m[2]);
    return mins < 60 ? Number(m[1]) * 60 + mins : null;
  }

  // "2h", "90m", "1.5h", "1h30", "1h30m"
  m = s.match(/^(?:(\d+(?:\.\d+)?)h(?:ours?|rs?)?)?(?:(\d+)(?:m(?:in(?:ute)?s?)?)?)?$/);
  if (m && s.includes("h") && (m[1] || m[2])) {
    return Math.round(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0));
  }
  m = s.match(/^(\d+)m(?:in(?:ute)?s?)?$/);
  if (m) return Number(m[1]);

  // A bare number is hours, whole or decimal ("-2" is read only to say it must be more than 0).
  m = s.match(/^-?(\d+)(\.\d+)?$/);
  if (m) {
    const n = Number(s);
    if (n > 24) return { error: m[2] ? DURATION_TOO_LONG : minutesHint(n) };
    return Math.round(n * 60);
  }
  return null;
}

/** 90 → "1:30" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** 90 → "1.50" — decimal hours for invoicing. */
export function formatDecimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

/**
 * What a "+" quick-time chip does to the time box: it adds its minutes to what is there ("1:15" + 30 = 105).
 * An empty box starts at 0. A box that cannot be read also starts at 0, so the chip's own amount replaces the bad text.
 * That includes "0" and a bare "45" (issue 435): the field already shows its hint before the chip is pressed.
 * `from` is where the reward roll starts, `to` is the new value.
 */
export function addChipTime(current: string, chipMinutes: number): { from: number; to: number } {
  const from = parseDuration(current) ?? 0;
  return { from, to: from + chipMinutes };
}
