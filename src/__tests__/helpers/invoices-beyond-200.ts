import { addDays } from "@/lib/dates";

import type { HistoryRow } from "./memory-invoice-history";

/*
 * An account with more than 200 invoices, for the journeys that prove Clients and the MCP tools read every one.
 * User u1: 205 USD invoices for c1 "Acme" and 3 for c2 "Globex"; user u2: 4 for its own c9, one of them numbered like
 * u1's oldest. Every amount and paid state is fixed, so the totals below are exact.
 */

export const TODAY = "2026-11-18";
/** c1's oldest invoice: older than any other, so it is never among the newest 200. */
export const OLDEST_NUMBER = "INV-1999-001";

export const C1_COUNT = 205;
export const C2_COUNT = 3;
/** c1's two newest invoices are paid; the other 203 (more than a page) are unpaid. */
export const C1_PAID = 2;
export const C1_UNPAID = C1_COUNT - C1_PAID; // 203
export const C1_CENTS = 10_000; // each c1 invoice: $100.00
/** c2: three invoices of $500.00; the newest is paid, the other two are not. */
export const C2_CENTS = 50_000;
export const C2_UNPAID = 2;

/** u1's unpaid USD over EVERY invoice: 203 × $100 + 2 × $500 = $21,300.00. */
export const U1_UNPAID_CENTS = C1_UNPAID * C1_CENTS + C2_UNPAID * C2_CENTS; // 2_130_000

type Seed = Pick<HistoryRow, "id" | "user_id" | "number" | "client_id" | "client_name" | "issue_date"> &
  Partial<HistoryRow>;

function invoice(s: Seed): HistoryRow {
  return {
    due_date: addDays(s.issue_date ?? TODAY, 30),
    paid_date: null,
    period_from: s.issue_date ?? TODAY,
    period_to: s.issue_date ?? TODAY,
    total_minutes: 60,
    total_cents: C1_CENTS,
    currency: "USD",
    notes: "",
    summary: "Website",
    created_at: new Date(`${s.issue_date}T12:00:00Z`),
    search_text: `${s.number.toLowerCase()} ${(s.client_name ?? "").toLowerCase()} website`,
    ...s,
    snapshot: JSON.stringify({
      number: s.number,
      issueDate: s.issue_date,
      seller: { name: "Jo LLC", logo: null, paymentInstructions: null },
      client: { name: s.client_name, legalName: null, address: null, logo: null },
      lines: [],
    }),
  };
}

/** c1 invoice n (0 = the newest), issued n + 1 days before today; the last one is OLDEST_NUMBER, issued 2000-01-01. */
function acmeInvoice(n: number): HistoryRow {
  const isOldest = n === C1_COUNT - 1;
  const issued = isOldest ? "2000-01-01" : addDays(TODAY, -n - 1);
  return invoice({
    id: `a${String(n).padStart(3, "0")}`,
    user_id: "u1",
    number: isOldest ? OLDEST_NUMBER : `INV-2026-${String(n + 1).padStart(3, "0")}`,
    client_id: "c1",
    client_name: "Acme",
    issue_date: issued,
    paid_date: n < C1_PAID ? addDays(issued, 5) : null,
  });
}

/** c2 invoice k, issued 60·k + 1 days before today (late in the day, so it sorts after c1's of that day). */
function globexInvoice(k: number): HistoryRow {
  const issued = addDays(TODAY, -60 * k - 1);
  return invoice({
    id: `b${k}`,
    user_id: "u1",
    number: `GLX-${k + 1}`,
    client_id: "c2",
    client_name: "Globex",
    issue_date: issued,
    total_cents: C2_CENTS,
    paid_date: k === 0 ? addDays(issued, 3) : null,
    created_at: new Date(`${issued}T18:00:00Z`),
  });
}

/** u2's invoice k: another account, never counted for u1. */
function theirInvoice(k: number): HistoryRow {
  return invoice({
    id: `z${k}`,
    user_id: "u2",
    number: `INV-1999-00${k + 1}`,
    client_id: "c9",
    client_name: "Theirs",
    issue_date: addDays(TODAY, -k - 1),
    total_cents: 99_900,
  });
}

/** Two unpaid EUR invoices for c2: €75.00 and €125.00, €200.00 together. */
export const EUR_CENTS = [7_500, 12_500] as const;
export function euroInvoices(): HistoryRow[] {
  return EUR_CENTS.map((cents, k) =>
    invoice({
      id: `e${k}`,
      user_id: "u1",
      number: `GLX-EUR-${k + 1}`,
      client_id: "c2",
      client_name: "Globex",
      issue_date: addDays(TODAY, -2 - k),
      total_cents: cents,
      currency: "EUR",
    }),
  );
}

/** The whole seed: u1's 208 invoices and u2's 4, in no particular order. */
export function seedBeyond200(): HistoryRow[] {
  return [
    ...Array.from({ length: C1_COUNT }, (_, n) => acmeInvoice(n)),
    ...Array.from({ length: C2_COUNT }, (_, k) => globexInvoice(k)),
    ...Array.from({ length: 4 }, (_, k) => theirInvoice(k)),
  ].reverse();
}
