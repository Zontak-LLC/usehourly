import {
  DURATION_NOT_POSITIVE,
  MAX_BARE_HOURS,
  MAX_ENTRY_MINUTES,
  minutesHint,
  readDurationText,
} from "@/lib/duration";

export { MAX_BARE_HOURS, MAX_ENTRY_MINUTES, minutesHint };

/** The words a typed time box shows under itself. Plain and short: they sit in one line under the box. */
export const TYPED_UNREADABLE = "Try 1.5, 1:30 or 90m";
export const TYPED_NOT_POSITIVE = DURATION_NOT_POSITIVE;
export const TYPED_TOO_LONG = "One entry can be up to 24 hours";

/** What a typed time box holds: minutes it can log, words that say why not, or nothing at all (an empty box). */
export type TypedDuration = { minutes: number; error?: undefined } | { minutes?: undefined; error: string } | Empty;
type Empty = { minutes?: undefined; error?: undefined };

/**
 * Read what someone typed in a time box (Log time, quick-create, an entry row, the team box). Unlike `parseDuration`
 * (CSV, MCP, the server), every bare number is hours, so "2" never logs two minutes; minutes need "m".
 *   "2" → 120   "1,5" / "1.5" → 90   "1:30" / "90m" / "1h30" → as written
 *   "25" → "Did you mean 25 minutes? Type 25m" (a bare whole number over 24 that could be minutes)
 *   "0", "-2", "-1:30" → "Enter more than 0, like 1:30"   over 24 hours → "One entry can be up to 24 hours"
 * Returns `{}` for an empty box (no minutes and no error). Never throws.
 */
export function readTypedDuration(input: string): TypedDuration {
  const s = input.trim();
  if (!s) return {};
  // A minus in front of a time that reads is a time below 0, not a typo.
  if (s.startsWith("-")) return { error: readDurationText(s.slice(1)) ? TYPED_NOT_POSITIVE : TYPED_UNREADABLE };
  const text = readDurationText(s);
  if (!text) return { error: TYPED_UNREADABLE };
  if ("minutes" in text) return withinOneEntry(text.minutes);
  if (text.bareHours <= MAX_BARE_HOURS) return withinOneEntry(Math.round(text.bareHours * 60));
  const couldBeMinutes = text.isWhole && text.bareHours <= MAX_ENTRY_MINUTES;
  return { error: couldBeMinutes ? minutesHint(text.bareHours) : TYPED_TOO_LONG };
}

function withinOneEntry(minutes: number): TypedDuration {
  if (minutes <= 0) return { error: TYPED_NOT_POSITIVE };
  if (minutes > MAX_ENTRY_MINUTES) return { error: TYPED_TOO_LONG };
  return { minutes };
}

/**
 * What a "+" quick-time chip does to the time box: it adds its minutes to what is there ("1:15" + 30 = 105).
 * An empty box starts at 0. A box that cannot be logged ("abc", "0", a bare "25") also starts at 0, so the chip's own
 * amount replaces the bad text; the box already shows why before the chip is pressed.
 * Returns `from`, where the reward roll starts, and `to`, the new value.
 */
export function addChipTime(current: string, chipMinutes: number): { from: number; to: number } {
  const from = readTypedDuration(current).minutes ?? 0;
  return { from, to: from + chipMinutes };
}
