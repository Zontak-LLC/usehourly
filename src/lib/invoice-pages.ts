/**
 * Pure rules for Invoices' "Load more": the server sends the history 200 at a time (`invoice.listPage`), with the tab
 * and the search applied there. Shared by the page and its tests.
 */

import type { InvoiceTab, ListInvoice } from "@/lib/invoice-list";

/** The longest search the server takes (`q` in `invoice.listPage`); a longer one is cut, never refused. */
const SEARCH_MAX = 100;

/** What Invoices (and a client's Invoices tab on Clients) asks `invoice.listPage` for; the cursor is added page by page. */
export type InvoicePageQuery = {
  q?: string;
  status?: "paid" | "waiting" | "overdue";
  today?: string;
  clientId?: string;
};

/** Every loaded page's invoices, in order: one list. No pages (nothing loaded yet) gives `[]`. */
export function flattenInvoicePages<T>(pages: readonly { items: readonly T[] }[] | undefined): T[] {
  return (pages ?? []).flatMap((p) => p.items);
}

/**
 * The month (`YYYY-MM`) of the last loaded invoice while another page may hold more of it, else `undefined`. That
 * month's sum would be short, so the list shows its count instead until the month is fully loaded.
 */
export function partialMonth(
  loaded: readonly Pick<ListInvoice, "issue_date">[],
  { hasMore }: { hasMore: boolean },
): string | undefined {
  if (!hasMore) return undefined;
  return loaded.at(-1)?.issue_date.slice(0, 7);
}

/**
 * The `invoice.listPage` input for the screen's tab and search box: All asks for everything, Paid for paid ones, and
 * Waiting and Overdue for those with the browser's `today`. An empty search sends no `q`. Returns `undefined` while
 * Waiting or Overdue has no `today` yet (the first render), so nothing is asked too early.
 */
export function listPageInput({
  tab,
  search,
  today,
}: {
  tab: InvoiceTab;
  search: string;
  today: string | null;
}): InvoicePageQuery | undefined {
  const q = search.trim().slice(0, SEARCH_MAX);
  const words = q ? { q } : {};
  if (tab === "all") return words;
  if (tab === "paid") return { ...words, status: "paid" };
  if (!today) return undefined;
  return { ...words, status: tab, today };
}
