import { toCsv } from "@/lib/csv";
import { categoryLabel, rateInput } from "@/lib/expenses";
import { amountCents } from "@/lib/invoice";
import { currencyOrDefault, effectiveCurrency } from "@/lib/money";
import type { SheetEntry } from "@/lib/timesheet";

/**
 * The CSV files of the exports: entries, invoices and expenses. Plain text only, with no import of the Excel or zip code,
 * so "Download this week as CSV" loads this small module and nothing of "Download everything" (issue 425).
 */

/** One invoice of the history, as `invoice.listAll` returns it. */
export type InvoiceRow = {
  number: string;
  client_name: string;
  issue_date: string;
  due_date: string | null;
  paid_date: string | null;
  period_from: string;
  period_to: string;
  total_minutes: number;
  total_cents: number;
  currency: string;
};

/**
 * Hours as a 2-decimal number, for CSV and README text only: a CSV has no number format, so
 * unrounded hours would print 0.3333333333333333. The exact Minutes column sits next to it, and
 * amounts come from minutes, never from these rounded hours. The .xlsx files write minutes / 60.
 */
export const csvHours = (m: number) => Math.round((m / 60) * 100) / 100;

/** How `entriesCsv` writes its rows. */
export type EntriesCsvOptions = {
  /**
   * Add a last "Billable day" column (Yes/No) and leave Amount empty on days marked non-billable. The zip sets it, as it
   * holds every day; the Week/Month CSV leaves those days out instead.
   */
  billableDayColumn?: boolean;
};

const ENTRIES_HEADER = [
  "Date",
  "Client",
  "Project",
  "Note",
  "Hours",
  "Minutes",
  "Billable",
  "Rate (per hour)",
  "Amount",
  "Currency",
];

/**
 * Every entry, one row each, by date, client and project; amounts in the client's (or the account's) currency. Returns
 * the CSV text with its BOM.
 */
export function entriesCsv(entries: SheetEntry[], accountCurrency?: string, options: EntriesCsvOptions = {}): string {
  const withDay = options.billableDayColumn === true;
  const rows: (string | number | null)[][] = [withDay ? [...ENTRIES_HEADER, "Billable day"] : ENTRIES_HEADER];
  const sorted = [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.project.client.name.localeCompare(b.project.client.name) ||
      a.project.name.localeCompare(b.project.name),
  );
  for (const e of sorted) {
    const rate = e.project.hourly_rate / 100;
    // The same per-entry cent rounding as the invoice line, from exact minutes (issue 450).
    const isBilledDay = !(withDay && e.non_billable);
    const amount =
      e.project.billable && rate && isBilledDay ? amountCents(e.minutes, e.project.hourly_rate) / 100 : null;
    const row: (string | number | null)[] = [
      e.date,
      e.project.client.name,
      e.project.name,
      e.note,
      csvHours(e.minutes),
      e.minutes,
      e.project.billable ? "Yes" : "No",
      rate || null,
      amount,
      effectiveCurrency(e.project.client.currency, accountCurrency),
    ];
    rows.push(withDay ? [...row, isBilledDay ? "Yes" : "No"] : row);
  }
  return toCsv(rows);
}

/** The invoice history, one row per invoice, in the order given. */
export function invoicesCsv(invoices: InvoiceRow[]): string {
  const rows: (string | number | null)[][] = [
    ["Number", "Client", "Issued", "Due", "Paid", "Period from", "Period to", "Hours", "Total", "Currency", "Status"],
  ];
  for (const i of invoices) {
    rows.push([
      i.number,
      i.client_name,
      i.issue_date,
      i.due_date,
      i.paid_date,
      i.period_from,
      i.period_to,
      csvHours(i.total_minutes),
      i.total_cents / 100,
      currencyOrDefault(i.currency),
      i.paid_date ? "Paid" : "Unpaid",
    ]);
  }
  return toCsv(rows);
}

/** One expense or mileage trip, as `expense.listAll` returns it (units as stored, see lib/expenses.ts). */
export type ExpenseCsvRow = {
  date: string;
  kind: string;
  category: string;
  amount_cents: number;
  currency: string | null;
  note: string | null;
  distance: number | null;
  distance_unit: string | null;
  mileage_rate: number | null;
  client: { name: string } | null;
};

/** Every expense and mileage trip, by date and client. */
export function expensesCsv(expenses: ExpenseCsvRow[]): string {
  const rows: (string | number | null)[][] = [
    ["Date", "Kind", "Category", "Amount", "Currency", "Distance", "Unit", "Rate (per unit)", "Client", "Note"],
  ];
  const sorted = [...expenses].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.client?.name ?? "").localeCompare(b.client?.name ?? ""),
  );
  for (const x of sorted) {
    const trip = x.kind === "mileage";
    rows.push([
      x.date,
      trip ? "Mileage" : "Expense",
      categoryLabel(x.category),
      x.amount_cents / 100,
      currencyOrDefault(x.currency),
      trip && x.distance !== null ? x.distance / 10 : null,
      trip ? (x.distance_unit === "km" ? "km" : "mi") : null,
      trip && x.mileage_rate !== null ? rateInput(x.mileage_rate) : null,
      x.client?.name ?? null,
      x.note,
    ]);
  }
  return toCsv(rows);
}
