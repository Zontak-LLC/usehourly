import { isPendingId } from "@/lib/optimistic-entries";

/*
 * "Log first, note later" (2026-10-24, the owner): time goes in with no description, and the note is added afterwards,
 * from the Log time form's follow-up box, a "+ Add note" in any entries list, or the day card's end-of-day line.
 */

type NoteEntry = { id: string; note: string; started_at: Date | string | null };

/**
 * An entry that still needs a note: stopped (a running timer is not finished yet), confirmed by the server (a row
 * still on its way has no id to change), and with nothing but spaces in its note.
 */
export function needsNote(entry: NoteEntry): boolean {
  return !entry.started_at && !isPendingId(entry.id) && entry.note.trim() === "";
}

/** The entries that still need a note, in the order the list shows them. */
export function entriesWithoutNote<T extends NoteEntry>(entries: readonly T[]): T[] {
  return entries.filter(needsNote);
}

/**
 * Where "Add notes" goes after a note was saved on `savedId`: the next entry in the list that still needs one, else
 * the first earlier one that does (skipped by Escape, say). Null when every entry has a note.
 */
export function nextWithoutNote(entries: readonly NoteEntry[], savedId: string): string | null {
  const at = entries.findIndex((e) => e.id === savedId);
  const open = (e: NoteEntry) => e.id !== savedId && needsNote(e);
  const after = entries.slice(at + 1).find(open);
  return (after ?? entries.find(open))?.id ?? null;
}

/**
 * Whether the day card shows "N entries have no note yet": only for today or a past day (a future day is plans, not
 * work), only once the day has an entry, only while one still needs a note, and not after "Not now" for that date.
 */
export function noteReminder(
  entries: readonly NoteEntry[],
  date: string,
  today: string | null,
  notNow: ReadonlySet<string>,
): number {
  if (!today || date > today || entries.length === 0 || notNow.has(date)) return 0;
  return entriesWithoutNote(entries).length;
}

/** The words of the reminder: "1 entry has no note yet." / "3 entries have no note yet." */
export function noteReminderText(count: number): string {
  return count === 1 ? "1 entry has no note yet." : `${count} entries have no note yet.`;
}
