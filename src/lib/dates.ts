/** Local-date helpers. Dates are YYYY-MM-DD strings, never timezone-shifted. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = fromISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Monday of the week containing `s`. */
export function startOfWeek(s: string): string {
  const d = fromISODate(s);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  return addDays(s, -dow);
}
