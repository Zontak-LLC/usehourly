import type { AnnualReport } from "./annual-report";
import { type EmailBlock, type EmailTable, type EmailTableRow, renderEmail } from "./email-template";
import type { MailMessage } from "./mailer";
import { formatMoney } from "./money";
import {
  activeMonths,
  EARNED_NOTE,
  h,
  INVOICE_HEAD,
  invoiceRows,
  monthRows,
  PAYMENT_HEAD,
  PAYMENT_NOTE,
  PERIOD_HEAD,
  paymentRows,
  periodTotal,
  projectTag,
  QUARTER_NOTE,
  quarterRows,
  yearFigures,
} from "./year-summary-rows";

/**
 * Emailing the year summary (the Year summary page's "Email me this"). It only ever goes to the account's own confirmed
 * address, so unlike an invoice it cannot be used to mail a stranger: no stop list is needed and the limits are small.
 */
export const REPORT_EMAILS_PER_DAY = 5;

/** Why this account may not email itself a report, or null if it may (no age rule: the address is its own). */
export function reportMailBlocker(owner: {
  email_verified_at: Date | null;
  email_bounced_at: Date | null;
  is_demo: boolean;
}): string | null {
  if (owner.is_demo) return "Create a free account to email your summary.";
  if (owner.email_verified_at === null) return "Confirm your email address first (Account page), then try again.";
  if (owner.email_bounced_at !== null) {
    return "Your email address bounced, so we can't send to it. Update it under Account first.";
  }
  return null;
}

/** Long lists show their first rows; the rest are on the page ("N more on the site"). */
export const MAX_LIST_ROWS = 25;

/** The page's link for that year, so "Open the Year summary" lands on the same year. */
export const reportLink = (base: string, year: number) => `${base}/dashboard/report?year=${year}`;

function clientRows(r: AnnualReport, money: (cents: number) => string): EmailTableRow[] {
  return r.clients.flatMap((c): EmailTableRow[] => [
    [c.client, "", h(c.minutes), c.earnedCents ? money(c.earnedCents) : "–"],
    ...r.projects
      .filter((p) => p.clientId === c.clientId)
      .map(
        (p): EmailTableRow => ({
          cells: [
            p.project,
            projectTag(p, money),
            h(p.minutes),
            p.billable && p.earnedCents ? money(p.earnedCents) : "–",
          ],
          sub: true,
        }),
      ),
  ]);
}

/** A list section: its table cut at MAX_LIST_ROWS, with how many more there are and where to see them. */
function listBlocks(table: EmailTable, link: string): EmailBlock[] {
  const more = table.rows.length - MAX_LIST_ROWS;
  if (more <= 0) return [{ table }];
  return [
    { table: { ...table, rows: table.rows.slice(0, MAX_LIST_ROWS) } },
    { small: `${more} more on the site.` },
    { button: { label: "See them all on the Year summary", url: link } },
  ];
}

/**
 * The summary as an email that looks like the Year summary page (issue 174): the same figures at the top, then By
 * quarter, By month (months with activity only), By client and project, and the invoices and payments, with the page's
 * own words (`lib/year-summary-rows.ts`), for one year and one currency.
 */
export function annualReportMessage(
  to: string,
  d: { year: number; currency: string; report: AnnualReport; link: string },
): MailMessage {
  const r = d.report;
  const money = (cents: number) => formatMoney(cents, d.currency);
  const months = activeMonths(r);
  const blocks: EmailBlock[] = [
    `Here is your UseHourly year summary for ${d.year}, in ${d.currency}. It is what the Year summary page showed when you sent it.`,
    { figures: yearFigures(r, money) },
    { heading: "By quarter" },
    { small: QUARTER_NOTE },
    { table: { head: ["Quarter", ...PERIOD_HEAD], rows: quarterRows(r, money), total: periodTotal(r, money) } },
  ];
  if (months.length > 0) {
    blocks.push(
      { heading: "By month" },
      { small: "Only months with activity are shown." },
      { table: { head: ["Month", ...PERIOD_HEAD], rows: monthRows(months, money), total: periodTotal(r, money) } },
    );
  }
  if (r.clients.length > 0) {
    blocks.push(
      { heading: "By client and project" },
      ...listBlocks({ head: ["Client", "Rate", "Hours", "Earned"], rows: clientRows(r, money), textCols: 2 }, d.link),
    );
  }
  if (r.invoices.count > 0) {
    blocks.push(
      { heading: `Invoices issued in ${d.year}` },
      ...listBlocks(
        {
          head: INVOICE_HEAD,
          rows: invoiceRows(r, money),
          total: ["Total", "", "", money(r.invoices.totalCents), ""],
          textCols: 3,
        },
        d.link,
      ),
    );
  }
  if (r.received.count > 0) {
    blocks.push(
      { heading: `Payments received in ${d.year}` },
      { small: PAYMENT_NOTE },
      ...listBlocks(
        {
          head: PAYMENT_HEAD,
          rows: paymentRows(r, money),
          total: ["Total", "", "", money(r.received.totalCents)],
          textCols: 3,
        },
        d.link,
      ),
    );
  }
  blocks.push({ small: EARNED_NOTE }, { button: { label: "Open the Year summary", url: d.link } });

  const mail = renderEmail({
    title: `Your ${d.year} year summary`,
    greeting: "Hi,",
    blocks,
    footnote: { text: "You are getting this because you chose “Email me this” on your UseHourly Year summary." },
  });
  return { to, subject: `Your ${d.year} year summary (${d.currency})`, ...mail };
}
