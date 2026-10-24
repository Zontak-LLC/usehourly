/**
 * The Year summary's sections (a split view like Account): their order, their names, which one an address opens, and
 * the one status line and key figure each shows in the list. Pure, and made only from the report the page already has
 * (plus the expenses it already lists), so the list costs no request and the tests read the same rules.
 */
import type { AnnualReport } from "./annual-report";
import { sectionFromHash } from "./section-hash";
import { activeMonths, h, plural } from "./year-summary-rows";

export const YEAR_SECTIONS = [
  { id: "year", label: "Your year" },
  { id: "quarters", label: "By quarter" },
  { id: "months", label: "By month" },
  { id: "clients", label: "Clients and projects" },
  { id: "invoices", label: "Invoices issued" },
  { id: "payments", label: "Payments received" },
  { id: "expenses", label: "Expenses" },
] as const;

export type YearSectionId = (typeof YEAR_SECTIONS)[number]["id"];

/** The sections shown: Expenses only while its feature switch is on. */
export const yearSections = (withExpenses: boolean) => YEAR_SECTIONS.filter((s) => withExpenses || s.id !== "expenses");

/** The section an address's #part opens, or null (the list on a phone; a wide screen then shows Your year). */
export const yearSectionFromHash = (hash: string, withExpenses: boolean): YearSectionId | null =>
  sectionFromHash(yearSections(withExpenses), hash);

export type YearSectionFacts = { line: string; figure: string };

/** Expenses as the list needs them (counted in the currency shown). */
export type ExpenseFacts = { count: number; totalCents: number };

/** One line and one figure per section. */
export function yearSectionFacts(
  data: AnnualReport,
  money: (cents: number) => string,
  expenses?: ExpenseFacts,
): Record<YearSectionId, YearSectionFacts> {
  const t = data.totals;
  const busiest = data.quarters.reduce((best, q) => (q.minutes > best.minutes ? q : best), data.quarters[0]);
  const months = activeMonths(data).length;
  const unpaid = data.invoices.list.filter((i) => !i.paid_date).length;
  const none = `None in ${data.year}`;
  return {
    // Received leads; Unpaid is its line, and Hours worked is the figure of By month and Clients and projects.
    year: { line: `${money(data.outstanding.totalCents)} unpaid`, figure: money(data.received.totalCents) },
    quarters: {
      line: busiest?.minutes ? `Busiest: Q${busiest.quarter}` : "No time logged",
      figure: money(t.earnedCents),
    },
    months: { line: months ? `${plural(months, "month")} active` : "No activity", figure: h(t.minutes) },
    clients: {
      line: `${plural(data.clients.length, "client")} · ${plural(data.projects.length, "project")}`,
      figure: h(t.minutes),
    },
    invoices: {
      line: data.invoices.count ? `${data.invoices.count} · ${unpaid} unpaid` : none,
      figure: money(data.invoices.totalCents),
    },
    payments: {
      line: data.received.count ? plural(data.received.count, "payment") : none,
      figure: money(data.received.totalCents),
    },
    expenses: {
      line: expenses?.count ? plural(expenses.count, "expense") : "None yet",
      figure: money(expenses?.totalCents ?? 0),
    },
  };
}
