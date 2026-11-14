"use client";

import { formatDate } from "@/lib/dates";
import { daysLate } from "@/lib/invoice-mail";
import { useToday } from "@/lib/use-today";

/**
 * "This invoice was due on …" on an unpaid invoice past its due date. It uses the viewer's own date (issue 452: the UTC
 * date called it overdue on a US evening of the due date) and the same rule as the Overdue tab, so the two agree.
 * Nothing shows until the page has loaded in the browser.
 */
export function InvoiceOverdueNote({ dueDate, paidDate }: { dueDate: string | null; paidDate: string | null }) {
  const today = useToday();
  if (today === null || dueDate === null || daysLate({ due_date: dueDate, paid_date: paidDate }, today) === null)
    return null;
  return (
    <p className="rounded-xl border border-destructive/40 p-3 font-medium text-destructive text-sm">
      This invoice was due on {formatDate(dueDate, "day")}.
    </p>
  );
}
