/** Billing rules shared by the server and the screens: time not invoiced yet, and the next invoice number. */

export type Unbilled = {
  clientId: string;
  /** Billable minutes not on any invoice yet. */
  minutes: number;
  /** What they are worth at the projects' current rates (rounding rules are applied only on the invoice itself). */
  cents: number;
  /** The oldest and newest day with unbilled time. */
  from: string;
  to: string;
};

/** The next free number for a year: one more than the highest used (a count would clash after a delete). */
export function nextInvoiceNumber(year: number, used: string[]): string {
  const prefix = `INV-${year}-`;
  let highest = 0;
  for (const n of used) {
    if (!n.startsWith(prefix)) continue;
    const k = Number.parseInt(n.slice(prefix.length), 10);
    if (Number.isFinite(k) && k > highest) highest = k;
  }
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}
