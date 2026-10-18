import type { PrismaClient } from "@prisma/client";

import { normalizeEmail } from "@/lib/email";
import { formatMoney, type InvoiceSnapshot } from "@/lib/invoice";
import {
  INVOICE_EMAILS_PER_ACCOUNT_PER_DAY,
  INVOICE_EMAILS_PER_RECIPIENT_PER_DAY,
  senderBlocker,
} from "@/lib/invoice-mail";
import { logError } from "@/lib/log";
import { invoiceEmailMessage, type Mailer } from "@/lib/mailer";
import { describeWait, hitRateLimit } from "@/lib/rate-limit";
import { stopEmailToken } from "@/lib/reminder-token";
import { sha256Hex } from "@/lib/sha256";

import { createInvoiceLink, LinkLimitError } from "./invoice-link";

type Db = PrismaClient;

/** 2026-11-13 as "Nov 13, 2026", read as a plain calendar date (no time zone shifts). */
const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/** Remember addresses that must not be mailed again (they asked to stop, or bounced for good). */
export async function suppressEmails(prisma: Pick<Db, "emailSuppression">, emails: string[], reason: string) {
  for (const raw of emails) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    await prisma.emailSuppression.upsert({ where: { email }, create: { email, reason }, update: {} });
  }
}

/** A problem sending, in words fit to show the freelancer. `code` lets a caller pick an HTTP-ish status. */
export class InvoiceMailError extends Error {
  constructor(
    message: string,
    readonly code:
      | "FORBIDDEN"
      | "BAD_REQUEST"
      | "NOT_FOUND"
      | "TOO_MANY_REQUESTS"
      | "PRECONDITION_FAILED"
      | "INTERNAL_SERVER_ERROR",
  ) {
    super(message);
  }
}

export type DeliverInput = {
  prisma: Db;
  mailer: Mailer | null;
  userId: string;
  invoiceId: string;
  kind: "invoice" | "reminder";
  note: string | null;
  linkDays: number;
  appUrl: string;
  secret: string;
  now?: Date;
};

/**
 * Emails one invoice to its client with a fresh private link, after every guard: the account is confirmed and not new,
 * the client has an address that has not opted out, and neither the account nor the recipient is over its daily limit.
 * Used by the "Email it" button and by the overdue reminders, so the rules cannot differ between them.
 * If the send fails, the link it made is turned off again and nothing is recorded.
 */
export async function deliverInvoiceEmail(i: DeliverInput): Promise<{ to: string; linkId: string }> {
  const { prisma, mailer, userId } = i;
  const now = i.now ?? new Date();
  if (!mailer) throw new InvoiceMailError("Email isn't set up on this server yet.", "PRECONDITION_FAILED");

  const owner = await prisma.authUser.findUnique({
    where: { id: userId },
    select: { email: true, email_verified_at: true, email_bounced_at: true, is_demo: true, created_at: true },
  });
  if (!owner) throw new InvoiceMailError("Account not found.", "NOT_FOUND");
  const blocked = senderBlocker(owner, now);
  if (blocked) throw new InvoiceMailError(blocked, "FORBIDDEN");

  const invoice = await prisma.invoice.findFirst({
    where: { id: i.invoiceId, user_id: userId },
    select: {
      id: true,
      number: true,
      due_date: true,
      paid_date: true,
      total_cents: true,
      client_id: true,
      snapshot: true,
    },
  });
  if (!invoice) throw new InvoiceMailError("Invoice not found.", "NOT_FOUND");
  if (i.kind === "reminder" && invoice.paid_date !== null) {
    throw new InvoiceMailError("This invoice is already marked paid.", "BAD_REQUEST");
  }

  const client = invoice.client_id
    ? await prisma.client.findFirst({
        where: { id: invoice.client_id, user_id: userId },
        select: { name: true, email: true },
      })
    : null;
  const to = client?.email ? normalizeEmail(client.email) : "";
  if (!to) {
    throw new InvoiceMailError(
      `Add an email address for ${client?.name ?? "this client"} under Clients & Projects, Billing details, first.`,
      "BAD_REQUEST",
    );
  }
  if (await prisma.emailSuppression.findUnique({ where: { email: to } })) {
    throw new InvoiceMailError(
      "That address has asked not to get emails from UseHourly. Copy the invoice link and send it yourself instead.",
      "FORBIDDEN",
    );
  }

  // Daily limits, counted atomically. The recipient's is across every sender: nobody gets buried by invoices.
  const wait = async (key: string, limit: number) => {
    const r = await hitRateLimit(prisma, key, limit, 86_400);
    return r.allowed ? null : describeWait(r.retryAfterSeconds);
  };
  const accountWait = await wait(`invmail:u:${userId}`, INVOICE_EMAILS_PER_ACCOUNT_PER_DAY);
  if (accountWait) {
    throw new InvoiceMailError(
      `You've emailed ${INVOICE_EMAILS_PER_ACCOUNT_PER_DAY} invoices today. Try again in ${accountWait}.`,
      "TOO_MANY_REQUESTS",
    );
  }
  const recipientWait = await wait(`invmail:r:${await sha256Hex(to)}`, INVOICE_EMAILS_PER_RECIPIENT_PER_DAY);
  if (recipientWait) {
    throw new InvoiceMailError(
      `That address already got ${INVOICE_EMAILS_PER_RECIPIENT_PER_DAY} emails today. Try again in ${recipientWait}.`,
      "TOO_MANY_REQUESTS",
    );
  }

  let link: { id: string; token: string };
  try {
    link = await createInvoiceLink(prisma, userId, invoice.id, i.linkDays);
  } catch (err) {
    if (err instanceof LinkLimitError) throw new InvoiceMailError(err.message, "BAD_REQUEST");
    throw err;
  }

  let sellerName = "";
  try {
    sellerName = (JSON.parse(invoice.snapshot) as InvoiceSnapshot).seller.name;
  } catch {
    // an unreadable copy still sends, under a plain name
  }
  const stop = await stopEmailToken(i.secret, to);
  const query = `e=${encodeURIComponent(to)}&t=${encodeURIComponent(stop)}`;
  const message = invoiceEmailMessage(to, {
    kind: i.kind,
    sellerName: sellerName || "Your contact",
    sellerEmail: owner.email,
    number: invoice.number,
    totalLabel: formatMoney(invoice.total_cents),
    dueLabel: invoice.due_date ? longDate(invoice.due_date) : null,
    note: i.note,
    link: `${i.appUrl}/invoice/${link.token}`,
    stopUrl: `${i.appUrl}/stop-emails?${query}`,
    oneClickUrl: `${i.appUrl}/api/stop-emails?${query}`,
  });
  try {
    await mailer.send(message);
  } catch (err) {
    logError("invoice_email_failed", err);
    await prisma.invoiceLink.updateMany({
      where: { id: link.id },
      data: { revoked_at: Math.floor(now.getTime() / 1000) },
    });
    throw new InvoiceMailError(
      "Couldn't send the email right now. Please try again in a minute.",
      "INTERNAL_SERVER_ERROR",
    );
  }
  await prisma.invoiceEmail.create({ data: { user_id: userId, invoice_id: invoice.id, to_email: to, kind: i.kind } });
  return { to, linkId: link.id };
}
