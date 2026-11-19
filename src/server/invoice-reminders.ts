import type { PrismaClient } from "@prisma/client";

import { addDays } from "@/lib/dates";
import { dueReminder, REMINDER_LINK_DAYS } from "@/lib/invoice-mail";
import { logError } from "@/lib/log";
import type { Mailer } from "@/lib/mailer";
import { isValidTimeZone, localParts } from "@/lib/reminder";

import { deliverInvoiceEmail, InvoiceMailError } from "./invoice-mail";

export type InvoiceReminderRun = { considered: number; sent: number; skipped: number; retry: number };

const MAX_PER_RUN = 200;

/**
 * Today's date where the invoice's owner is (issue 452). Most owners have no stored time zone (only the Friday reminder
 * card saves one), so they keep the UTC date, the owner's chosen fallback: for them the first reminder can still arrive
 * on the US evening of the due date. A missing or invalid zone never throws.
 */
function ownerToday(now: Date, timezone: string | null): string {
  return timezone && isValidTimeZone(timezone) ? localParts(now, timezone).date : now.toISOString().slice(0, 10);
}

/**
 * Overdue reminders for invoices whose owner opted in when sending (`remind_overdue`): the first a day after the due date
 * and the second a week after, never for a paid invoice. Called every hour by the cron job.
 *
 * Each reminder is claimed first with one conditional UPDATE (the count of reminders already sent), so two overlapping
 * runs can never both send it, and marking an invoice paid between the claim and the send stops it in `deliverInvoiceEmail`.
 * Every send goes through the same guards as the "Email it" button, including the daily limits and the stop list.
 * Trouble that may pass (a limit, the email service) gives the claim back so the next hour tries again; trouble that will not
 * (no client address, the client opted out, the owner is not confirmed) uses the reminder up and moves on.
 */
export async function runInvoiceReminders(opts: {
  prisma: PrismaClient;
  mailer: Mailer | null;
  appUrl: string;
  secret: string;
  now?: Date;
}): Promise<InvoiceReminderRun> {
  const { prisma, mailer } = opts;
  const now = opts.now ?? new Date();
  const utcToday = now.toISOString().slice(0, 10);
  const run: InvoiceReminderRun = { considered: 0, sent: 0, skipped: 0, retry: 0 };
  if (!mailer) return run;

  // One day past the UTC date, because an owner east of UTC (Tokyo) can already be on the next day; dueReminder then
  // decides with each owner's own date.
  const candidates = await prisma.invoice.findMany({
    where: { remind_overdue: true, paid_date: null, due_date: { lt: addDays(utcToday, 1) }, reminders_sent: { lt: 2 } },
    select: { id: true, user_id: true, due_date: true, paid_date: true, reminders_sent: true },
    orderBy: { id: "asc" },
    take: MAX_PER_RUN,
  });
  const ownerIds = [...new Set(candidates.map((inv) => inv.user_id))];
  const owners = ownerIds.length
    ? await prisma.authUser.findMany({ where: { id: { in: ownerIds } }, select: { id: true, timezone: true } })
    : [];
  const timezoneOf = new Map(owners.map((o) => [o.id, o.timezone]));

  for (const inv of candidates) {
    run.considered++;
    const stage = dueReminder(inv, ownerToday(now, timezoneOf.get(inv.user_id) ?? null));
    if (stage === null) continue;
    const claim = await prisma.invoice.updateMany({
      where: { id: inv.id, remind_overdue: true, paid_date: null, reminders_sent: stage },
      data: { reminders_sent: stage + 1 },
    });
    if (claim.count === 0) continue; // another run, or the invoice was paid, got there first
    const giveBack = () =>
      prisma.invoice.updateMany({ where: { id: inv.id, reminders_sent: stage + 1 }, data: { reminders_sent: stage } });
    try {
      await deliverInvoiceEmail({
        prisma,
        mailer,
        userId: inv.user_id,
        invoiceId: inv.id,
        kind: "reminder",
        note: null,
        linkDays: REMINDER_LINK_DAYS,
        appUrl: opts.appUrl,
        secret: opts.secret,
        now,
      });
      run.sent++;
    } catch (err) {
      const mayPass =
        !(err instanceof InvoiceMailError) || err.code === "TOO_MANY_REQUESTS" || err.code === "INTERNAL_SERVER_ERROR";
      if (!(err instanceof InvoiceMailError)) logError("invoice_reminder_failed", err);
      if (mayPass) {
        await giveBack();
        run.retry++;
      } else {
        run.skipped++;
      }
    }
  }
  return run;
}
