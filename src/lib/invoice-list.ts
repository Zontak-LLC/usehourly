/**
 * Pure rules for the Invoices split view (2026-10-24): each invoice's state in words, the tabs and the search, the
 * month groups, the quiet money line, and the addresses. Shared by the page and its tests.
 */

import { fromISODate } from "@/lib/dates";
import type { InvoiceSnapshot } from "@/lib/invoice";
import { daysBetween, daysLate } from "@/lib/invoice-mail";
import { currencyOrDefault } from "@/lib/money";
import { PALETTE } from "@/lib/palette";
import { count } from "@/lib/plural";
import { splitIdFromPath } from "@/lib/split-path";

/** What a list row and the invoice's header need (the list's own rows have more). */
export type ListInvoice = {
  id: string;
  number: string;
  client_id: string | null;
  client_name: string;
  summary: string | null;
  issue_date: string;
  due_date: string | null;
  paid_date: string | null;
  period_from: string;
  period_to: string;
  total_minutes: number;
  total_cents: number;
  currency: string;
};

export type InvoiceTab = "all" | "waiting" | "overdue" | "paid";

export const INVOICE_TABS: { id: InvoiceTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
];

const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export type InvoiceState = { tab: Exclude<InvoiceTab, "all">; words: string; colour: string; late?: number };

/** "Paid Oct 20", "12 days late", "Due in 5 days", "Due today" or "Waiting" (no due date, or no "today" yet). */
export function invoiceState(i: Pick<ListInvoice, "due_date" | "paid_date">, today: string | null): InvoiceState {
  if (i.paid_date)
    return { tab: "paid", words: `Paid ${short.format(fromISODate(i.paid_date))}`, colour: PALETTE.money.paid };
  const late = today ? daysLate(i, today) : null;
  if (late !== null) return { tab: "overdue", words: `${count(late, "day")} late`, colour: PALETTE.money.late, late };
  if (today && i.due_date) {
    const left = daysBetween(today, i.due_date);
    return {
      tab: "waiting",
      words: left === 0 ? "Due today" : `Due in ${count(left, "day")}`,
      colour: PALETTE.money.waiting,
    };
  }
  return { tab: "waiting", words: "Waiting", colour: PALETTE.money.waiting };
}

/** How many invoices each tab holds. */
export function tabCounts(invoices: ListInvoice[], today: string | null): Record<InvoiceTab, number> {
  const c = { all: invoices.length, waiting: 0, overdue: 0, paid: 0 };
  for (const i of invoices) c[invoiceState(i, today).tab]++;
  return c;
}

/** The invoices a tab and a search show: every typed word must be in the number, the client or what it was for. */
export function filterInvoices<T extends ListInvoice>(invoices: T[], tab: InvoiceTab, q: string, today: string | null) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return invoices.filter((i) => {
    if (tab !== "all" && invoiceState(i, today).tab !== tab) return false;
    const text = `${i.number} ${i.client_name} ${i.summary ?? ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** Invoices under the month they were issued in, in the order given (the list is newest first). */
export function byMonth<T extends ListInvoice>(invoices: T[]): { key: string; items: T[] }[] {
  const months: { key: string; items: T[] }[] = [];
  for (const i of invoices) {
    const key = i.issue_date.slice(0, 7);
    const last = months.at(-1);
    if (last?.key === key) last.items.push(i);
    else months.push({ key, items: [i] });
  }
  return months;
}

export type MoneyLine = { currency: string; paid: number; unpaid: number; late: number };

/** Paid, unpaid (late included) and late, per currency: amounts in two currencies are never added. */
export function moneyLines(invoices: ListInvoice[], today: string | null): MoneyLine[] {
  const lines = new Map<string, MoneyLine>();
  for (const i of invoices) {
    const currency = currencyOrDefault(i.currency);
    const line = lines.get(currency) ?? { currency, paid: 0, unpaid: 0, late: 0 };
    const tab = invoiceState(i, today).tab;
    if (tab === "paid") line.paid += i.total_cents;
    else line.unpaid += i.total_cents;
    if (tab === "overdue") line.late += i.total_cents;
    lines.set(currency, line);
  }
  return [...lines.values()];
}

/** The header of an invoice the list does not hold (older than the newest 200): read from its frozen copy. */
export function invoiceFromSnapshot(id: string, s: InvoiceSnapshot, paidDate: string | null): ListInvoice {
  return {
    id,
    number: s.number,
    client_id: null,
    client_name: s.client.name,
    summary: null,
    issue_date: s.issueDate,
    due_date: s.dueDate,
    paid_date: paidDate,
    period_from: s.periodFrom,
    period_to: s.periodTo,
    total_minutes: s.totalMinutes,
    total_cents: s.totalCents,
    currency: currencyOrDefault(s.currency),
  };
}

/** The address of one invoice, and the invoice an address names (null for the list and the builder). */
export const invoicePath = (id: string) => `/dashboard/invoices/${encodeURIComponent(id)}`;
export const invoiceIdFromPath = (pathname: string) => splitIdFromPath(pathname, "/dashboard/invoices", ["new"]);
