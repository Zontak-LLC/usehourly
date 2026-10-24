/**
 * Rules for emailing an invoice to a client (issue #35 step 4). Pure, so they are tested directly. Sending mail to a
 * stranger is the one thing here that can damage the sending domain every other email depends on (password resets
 * included), so the limits are strict and live in one place.
 */
export const INVOICE_EMAILS_PER_ACCOUNT_PER_DAY = 20;
export const INVOICE_EMAILS_PER_RECIPIENT_PER_DAY = 3;
export const MIN_ACCOUNT_AGE_HOURS = 24;
export const MAX_INVOICE_NOTE = 1000;
/** Reminders go out this many days after the due date (the first a day late, the second a week late). */
export const REMINDER_AFTER_DAYS = [1, 7] as const;
export const REMINDER_LINK_DAYS = 30;

/** Why this account may not email invoices yet, or null if it may. */
export function senderBlocker(
  owner: { email_verified_at: Date | null; email_bounced_at: Date | null; is_demo: boolean; created_at: Date },
  now: Date,
): string | null {
  if (owner.is_demo) return "Create a free account to email invoices.";
  if (owner.email_verified_at === null) {
    return "Confirm your own email address first (Account page), so your client's replies can reach you.";
  }
  if (owner.email_bounced_at !== null) {
    return "Your own email address bounced, so replies could not reach you. Update it under Account first.";
  }
  if (now.getTime() - owner.created_at.getTime() < MIN_ACCOUNT_AGE_HOURS * 3_600_000) {
    return "New accounts can email invoices after their first day. You can still copy the invoice link and send it yourself.";
  }
  return null;
}

const DAY = 86_400_000;
const dayNumber = (iso: string) => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / DAY);

/** Whole days between two YYYY-MM-DD dates (later minus earlier). */
export const daysBetween = (earlier: string, later: string) => dayNumber(later) - dayNumber(earlier);

/**
 * How many days an invoice is past its due date on `today`, or null when it is not overdue (paid, no due date, or not
 * due yet). The one "is it late" rule: the Overdue tab and the reminder draft both use it.
 */
export function daysLate(inv: { due_date: string | null; paid_date: string | null }, today: string): number | null {
  if (inv.paid_date !== null || inv.due_date === null || inv.due_date >= today) return null;
  return daysBetween(inv.due_date, today);
}

/**
 * Which reminder, if any, is due now: 0 for the first, 1 for the second. `sent` is how many have gone out.
 * Never for a paid invoice or one without a due date.
 */
export function dueReminder(
  inv: { due_date: string | null; paid_date: string | null; reminders_sent: number },
  today: string,
): number | null {
  if (inv.paid_date !== null || inv.due_date === null) return null;
  const stage = inv.reminders_sent;
  if (stage >= REMINDER_AFTER_DAYS.length) return null;
  return daysBetween(inv.due_date, today) >= REMINDER_AFTER_DAYS[stage] ? stage : null;
}
