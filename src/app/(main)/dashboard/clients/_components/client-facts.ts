/** Pure rules for the Clients page header lines: each client's latest invoice, and the order of the cards. */

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

/**
 * The cards in order: clients with time logged this month first, then the quiet ones (no time this month), each group
 * alphabetical. Before the month's totals arrive every client counts as active, so nothing is pushed down by mistake.
 */
export function orderClients<T extends { id: string; name: string }>(
  clients: readonly T[],
  monthMinutes: (client: T) => number | undefined,
): { client: T; quiet: boolean }[] {
  return clients
    .map((client) => {
      const minutes = monthMinutes(client);
      return { client, quiet: minutes !== undefined && minutes <= 0 };
    })
    .sort((a, b) => Number(a.quiet) - Number(b.quiet) || a.client.name.localeCompare(b.client.name));
}
