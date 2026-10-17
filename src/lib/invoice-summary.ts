import { formatDecimalHours } from "./duration";
import type { InvoiceSnapshot } from "./invoice";

const MAX_ITEMS = 3;
const MAX_ITEM_CHARS = 60;

const firstLine = (note: string) =>
  note
    .split(/\r?\n/)[0]
    .replace(/^[-*\u2022\s]+/, "")
    .trim();
const clip = (text: string) =>
  text.length > MAX_ITEM_CHARS ? `${text.slice(0, MAX_ITEM_CHARS - 1).trimEnd()}\u2026` : text;

/**
 * One line on what the invoice covers, from the time entries it was built from: the first few distinct
 * descriptions ("Homepage hero \u00b7 Nav fixes \u00b7 +3 more"). With no descriptions it falls back to the
 * projects and their hours. Plain text, safe to show anywhere.
 */
export function summarizeInvoice(s: Pick<InvoiceSnapshot, "lines" | "detail">): string {
  const seen = new Set<string>();
  const notes: string[] = [];
  for (const d of s.detail) {
    const n = firstLine(d.note);
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    notes.push(n);
  }
  if (notes.length > 0) {
    const shown = notes.slice(0, MAX_ITEMS).map(clip);
    const more = notes.length - shown.length;
    return [...shown, ...(more > 0 ? [`+${more} more`] : [])].join(" \u00b7 ");
  }
  return s.lines.map((l) => `${l.project} ${formatDecimalHours(l.minutes)} h`).join(" \u00b7 ");
}
