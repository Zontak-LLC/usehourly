/** Pure rules for the Clients page: each client's latest invoice and where it stands (the list order is in lib/client-list.ts). */

import { spanDays } from "@/lib/dates";

export type InvoiceFact = {
  /** Null when the client was deleted: such an invoice belongs to no card. */
  client_id: string | null;
  number: string;
  issue_date: string;
  due_date: string | null;
  paid_date: string | null;
};

/** Where an invoice stands on `today` (the browser's date): paid on a date, so many days late, due on a date, or open with no due date. */
type InvoiceStatus =
  | { kind: "paid"; date: string }
  | { kind: "late"; days: number }
  | { kind: "due"; date: string }
  | { kind: "open" };

/** The latest invoice per client, by issue date. On the same issue date the first one in the list wins (`invoice.list` is newest first). */
export function latestInvoiceByClient<T extends InvoiceFact>(invoices: readonly T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const inv of invoices) {
    if (!inv.client_id) continue;
    const seen = out.get(inv.client_id);
    if (!seen || inv.issue_date > seen.issue_date) out.set(inv.client_id, inv);
  }
  return out;
}

/** A paid invoice says when; an unpaid one past its due date says how many days late; otherwise when it is due. */
export function invoiceStatus(inv: InvoiceFact, today: string): InvoiceStatus {
  if (inv.paid_date) return { kind: "paid", date: inv.paid_date };
  if (!inv.due_date) return { kind: "open" };
  if (inv.due_date < today) return { kind: "late", days: spanDays(inv.due_date, today) - 1 };
  return { kind: "due", date: inv.due_date };
}
