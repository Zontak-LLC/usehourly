import type { AnnualReport } from "./annual-report";
import { formatDecimalHours } from "./duration";
import { renderEmail } from "./email-template";
import type { MailMessage } from "./mailer";
import { formatMoney } from "./money";

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

const hours = (minutes: number) => `${formatDecimalHours(minutes)} h`;
const MAX_CLIENTS = 15;

/** The summary as an email: the figures of the page for one year and one currency, in words and numbers only. */
export function annualReportMessage(
  to: string,
  d: { year: number; currency: string; report: AnnualReport; link: string },
): MailMessage {
  const r = d.report;
  const money = (cents: number) => formatMoney(cents, d.currency);
  const clients = r.clients.slice(0, MAX_CLIENTS);
  const mail = renderEmail({
    title: `Your ${d.year} year summary`,
    greeting: "Hi,",
    blocks: [
      `Here is your UseHourly year summary for ${d.year}, in ${d.currency}. It is what the Year summary page showed when you sent it.`,
      { heading: "Hours" },
      {
        rows: [
          ["Logged", hours(r.totals.minutes)],
          ["Billable", hours(r.totals.billableMinutes)],
          ["Not billable", hours(r.totals.nonBillableMinutes)],
          ["Days worked", String(r.totals.workedDays)],
        ],
      },
      { heading: "Money" },
      {
        rows: [
          ["Earned (billable time at your rates)", money(r.totals.earnedCents)],
          [`Invoiced (${r.invoices.count})`, money(r.invoices.totalCents)],
          [`Received in ${d.year} (${r.received.count})`, money(r.received.totalCents)],
          [`Outstanding at year end (${r.outstanding.count})`, money(r.outstanding.totalCents)],
        ],
      },
      { heading: "By quarter" },
      {
        rows: r.quarters.map((q): [string, string] => [
          `Q${q.quarter}`,
          `${hours(q.minutes)} · ${money(q.earnedCents)} earned · ${money(q.receivedCents)} received`,
        ]),
      },
      ...(clients.length > 0
        ? [
            { heading: "By client" },
            {
              rows: clients.map((c): [string, string] => [c.client, `${hours(c.minutes)} · ${money(c.earnedCents)}`]),
            },
          ]
        : []),
      "For the month by month detail and an Excel file, open the Year summary page and choose Export Excel.",
      { button: { label: "Open the Year summary", url: d.link } },
    ],
    footnote: { text: "You are getting this because you chose “Email me this” on your UseHourly Year summary." },
  });
  return { to, subject: `Your ${d.year} year summary (${d.currency})`, ...mail };
}
