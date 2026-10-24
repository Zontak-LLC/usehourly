import type { AnnualReport } from "./annual-report";
import { fromISODate } from "./dates";
import { formatDuration } from "./duration";

/**
 * The words and figures of the Year summary, written once for the page AND the emailed copy ("Email me this"), so the
 * two always say the same thing: same labels, same h:mm hours, same "–" for an empty figure, same dates.
 */

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type Money = (cents: number) => string;

/** Hours on screen are h:mm, as everywhere else in the app (files keep decimals). */
export const h = (m: number) => formatDuration(Math.round(m));
/** An empty figure is always "–" (never "0:00" in one table and "–" in another). */
export const hOrDash = (m: number) => (m ? h(m) : "–");
const moneyOrDash = (money: Money, cents: number) => (cents ? money(cents) : "–");

/** Dates read like the rest of the app ("Oct 9, 2026"); the export keeps YYYY-MM-DD. */
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
export const shortDay = (iso: string) => dayFormat.format(fromISODate(iso));

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export type YearFigure = { label: string; value: string; hint: string };

/** The money at the top of the page: Received and Unpaid first, then the quieter lines. */
export function yearFigures(data: AnnualReport, money: Money): YearFigure[] {
  const t = data.totals;
  return [
    {
      label: "Received",
      value: money(data.received.totalCents),
      hint: `${plural(data.received.count, "payment")}, by the date they were paid`,
    },
    {
      label: "Unpaid",
      value: money(data.outstanding.totalCents),
      hint: `${plural(data.outstanding.count, "invoice")} not paid at year end`,
    },
    {
      label: "Invoiced",
      value: money(data.invoices.totalCents),
      hint: `${plural(data.invoices.count, "invoice")} issued`,
    },
    { label: "Hours worked", value: h(t.minutes), hint: plural(t.workedDays, "day") },
    {
      label: "Billable hours",
      value: h(t.billableMinutes),
      hint: t.nonBillableMinutes ? `${h(t.nonBillableMinutes)} non-billable` : "all of it",
    },
    {
      label: "Earned",
      value: money(t.earnedCents),
      hint: "billable hours × today's rates: what the time is worth, not income",
    },
  ];
}

export const PERIOD_HEAD = ["Hours", "Billable", "Earned", "Received"];
export const QUARTER_NOTE = "Handy for quarterly estimated tax payments.";

export function periodTotal(data: AnnualReport, money: Money): string[] {
  return [
    "Total",
    h(data.totals.minutes),
    h(data.totals.billableMinutes),
    money(data.totals.earnedCents),
    money(data.received.totalCents),
  ];
}

export const quarterLabel = (q: number) =>
  `Q${q} · ${MONTHS[(q - 1) * 3].slice(0, 3)}–${MONTHS[q * 3 - 1].slice(0, 3)}`;

export function quarterRows(data: AnnualReport, money: Money): string[][] {
  return data.quarters.map((q) => [
    quarterLabel(q.quarter),
    hOrDash(q.minutes),
    hOrDash(q.billableMinutes),
    moneyOrDash(money, q.earnedCents),
    moneyOrDash(money, q.receivedCents),
  ]);
}

/** Months with something in them (time, earnings or a payment); empty months only bury the real ones. */
export const activeMonths = (data: AnnualReport) =>
  data.months.filter((m) => m.minutes || m.earnedCents || m.receivedCents);

export function monthRows(months: AnnualReport["months"], money: Money): string[][] {
  return months.map((m) => [
    MONTHS[m.month - 1],
    hOrDash(m.minutes),
    hOrDash(m.billableMinutes),
    moneyOrDash(money, m.earnedCents),
    moneyOrDash(money, m.receivedCents),
  ]);
}

/** A project's tag beside its name: its rate, "non-billable" or "no rate set". */
export function projectTag(p: AnnualReport["projects"][number], money: Money): string {
  if (!p.billable) return "non-billable";
  return p.rateCents > 0 ? `${money(p.rateCents)}/h` : "no rate set";
}

export const INVOICE_HEAD = ["Invoice", "Client", "Issued", "Total", "Paid on"];
export function invoiceRows(data: AnnualReport, money: Money): string[][] {
  return data.invoices.list.map((i) => [
    i.number,
    i.client_name,
    shortDay(i.issue_date),
    money(i.total_cents),
    i.paid_date ? shortDay(i.paid_date) : "Unpaid",
  ]);
}

export const PAYMENT_HEAD = ["Invoice", "Client", "Paid on", "Amount"];
export const PAYMENT_NOTE = "By the date the money arrived, including invoices issued in an earlier year.";
export function paymentRows(data: AnnualReport, money: Money): string[][] {
  return data.received.list.map((i) => [
    i.number,
    i.client_name,
    i.paid_date ? shortDay(i.paid_date) : "",
    money(i.total_cents),
  ]);
}

export const EARNED_NOTE =
  "“Earned” is billable hours × each project's current hourly rate: what the time is worth. “Received” is the invoices you marked as paid, by the date they were paid. Mark invoices paid on the Invoices page to keep it accurate, and check it against your bank deposits before filing. This is a summary of your own records, not tax advice.";
