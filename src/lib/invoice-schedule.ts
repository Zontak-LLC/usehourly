import { z } from "zod";

import { addDays, dateSchema, fromISODate, isRealDate, monthBounds } from "@/lib/dates";
import { daysBetween as daysFrom } from "@/lib/invoice-mail";

/*
 * How often a client is invoiced (2026-10-24, issue 100, "get paid without chasing"). Hours only: the invoice still
 * comes from the logged time. Nothing is sent and nothing is stored as a draft: when a period is over and its time is
 * not billed yet, the screens show one calm "invoice due" prompt that opens the invoice builder on that period.
 *
 * "Today" always comes from the browser (the Worker runs in UTC), so every rule here takes it as an argument.
 */

const INVOICE_EVERY = ["month", "2weeks"] as const;
export type InvoiceEvery = (typeof INVOICE_EVERY)[number];

export const isInvoiceEvery = (v: unknown): v is InvoiceEvery => INVOICE_EVERY.includes(v as InvoiceEvery);

export type InvoiceSchedule = { every: InvoiceEvery; anchor: string | null };

/** What `clients.update` takes: null = "when I choose"; every 2 weeks needs the first day of the first period. */
export const invoiceScheduleSchema = z
  .object({ every: z.enum(INVOICE_EVERY).nullable(), anchor: dateSchema.nullable() })
  .refine((v) => v.every !== "2weeks" || v.anchor !== null, {
    message: "Choose the first day of the first two weeks.",
    path: ["anchor"],
  });

/** A billing period and the day its invoice is due (the day after it ends). */
export type SchedulePeriod = { from: string; to: string; due: string };

const PERIOD_DAYS = 14;

/** The schedule stored on a client row, or null when it is invoiced "when I choose" (or the row holds nonsense). */
export function scheduleOf(row: {
  invoice_every?: string | null;
  invoice_anchor?: string | null;
}): InvoiceSchedule | null {
  if (row.invoice_every === "month") return { every: "month", anchor: null };
  if (row.invoice_every === "2weeks" && row.invoice_anchor && isRealDate(row.invoice_anchor)) {
    return { every: "2weeks", anchor: row.invoice_anchor };
  }
  return null;
}

/**
 * The latest period that is over on `today`, so its invoice is due: every month = the previous calendar month (due on
 * the 1st); every 2 weeks = the last full 14 days counted from the anchor (null until the first period has ended).
 */
export function duePeriod(s: InvoiceSchedule, today: string): SchedulePeriod | null {
  if (s.every === "month") {
    const thisMonth = monthBounds(today).from;
    const last = monthBounds(addDays(thisMonth, -1));
    return { from: last.from, to: last.to, due: thisMonth };
  }
  if (!s.anchor) return null;
  const k = Math.floor(daysFrom(s.anchor, today) / PERIOD_DAYS);
  if (k < 1) return null;
  const from = addDays(s.anchor, (k - 1) * PERIOD_DAYS);
  return { from, to: addDays(from, PERIOD_DAYS - 1), due: addDays(from, PERIOD_DAYS) };
}

/** The next day an invoice will be due, after `today` (for "Next invoice: Nov 1" in the settings). */
export function nextDueDate(s: InvoiceSchedule, today: string): string | null {
  if (s.every === "month") return addDays(monthBounds(today).to, 1);
  if (!s.anchor) return null;
  const k = Math.max(0, Math.floor(daysFrom(s.anchor, today) / PERIOD_DAYS));
  return addDays(s.anchor, (k + 1) * PERIOD_DAYS);
}

/** True when an invoice for this client already covers the whole period (made from the prompt or by hand). */
export function periodInvoiced(
  p: { from: string; to: string },
  invoices: { period_from: string; period_to: string }[],
) {
  return invoices.some((i) => i.period_from <= p.from && i.period_to >= p.to);
}

const monthName = new Intl.DateTimeFormat("en-US", { month: "long" });
const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** What the period is called on screen: "October" (or "December 2025" across a new year) or "Oct 5 – Oct 18". */
export function periodName(p: { from: string; to: string }, today: string): string {
  const start = fromISODate(p.from);
  const wholeMonth = p.from === monthBounds(p.from).from && p.to === monthBounds(p.from).to;
  if (wholeMonth) return (p.from.slice(0, 4) === today.slice(0, 4) ? monthName : monthYear).format(start);
  return `${shortDate.format(start)} – ${shortDate.format(fromISODate(p.to))}`;
}

/** The invoice builder's address for one client and period. */
export function invoiceBuilderHref(clientId: string, p: { from: string; to: string }) {
  const q = new URLSearchParams({ client: clientId, from: p.from, to: p.to });
  return `/dashboard/invoices/new?${q.toString()}`;
}

/** "October invoice for Acme is due" (or "October invoice is due" on the client's own profile). */
export function dueTitle(p: { from: string; to: string }, today: string, clientName?: string): string {
  return `${periodName(p, today)} invoice${clientName ? ` for ${clientName}` : ""} is due`;
}

/** The words under the setting: when the next invoice is due. */
export function scheduleHint(s: InvoiceSchedule | null, today: string): string {
  if (!s) return "No reminders: make an invoice whenever you like.";
  const next = nextDueDate(s, today);
  const when = next ? shortDate.format(fromISODate(next)) : "";
  return s.every === "month"
    ? `On the 1st, for the month before. Next: ${when}.`
    : `Every 14 days from the start date. Next: ${when}.`;
}
