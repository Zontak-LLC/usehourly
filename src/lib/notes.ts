/** Longest description of work a time entry can hold. */
export const NOTE_MAX = 2000;

/** The counter appears once a note is this close to the limit (80%). */
export const NOTE_WARN_AT = Math.floor(NOTE_MAX * 0.8);

/** Collapsed notes in lists show this many lines before "Show more". */
export const NOTE_PREVIEW_LINES = 2;

/** Notes this long (or with this many line breaks) get a "Show more" toggle in lists. */
export const NOTE_COLLAPSE_CHARS = 160;
export const NOTE_COLLAPSE_BREAKS = 2;

/** Longest note shown on an invoice's line items when "short descriptions" is on. */
export const NOTE_COMPACT_CHARS = 100;

/** Counter text ("1,640 / 2,000"), or null while the note is comfortably short. */
export function noteCounter(length: number): string | null {
  if (length < NOTE_WARN_AT) return null;
  return `${length.toLocaleString("en-US")} / ${NOTE_MAX.toLocaleString("en-US")}`;
}

/**
 * Text to insert when `pasted` lands on `current` (with `selected` characters replaced).
 * Returns what fits plus how many characters were left out, so the UI can say so instead of
 * silently cutting the end of a pasted paragraph.
 */
export function fitPaste(
  current: string,
  selected: number,
  pasted: string,
  max = NOTE_MAX,
): { text: string; dropped: number } {
  const room = Math.max(0, max - (current.length - selected));
  if (pasted.length <= room) return { text: pasted, dropped: 0 };
  return { text: pasted.slice(0, room), dropped: pasted.length - room };
}

/** True when a list should fold this note behind "Show more". */
export function isLongNote(note: string): boolean {
  return note.length > NOTE_COLLAPSE_CHARS || note.split("\n").length - 1 >= NOTE_COLLAPSE_BREAKS;
}

/** First line of a note, cut at `max` characters with an ellipsis. Used for compact invoices. */
export function shortNote(note: string, max = NOTE_COMPACT_CHARS): string {
  const first = note.trim().split("\n")[0].trim();
  // Three plain dots, not "…": the PDF's built-in font has no reliable glyph for the ellipsis.
  if (first.length > max) return `${first.slice(0, max - 3).trimEnd()}...`;
  return first === note.trim() ? first : `${first} ...`;
}
