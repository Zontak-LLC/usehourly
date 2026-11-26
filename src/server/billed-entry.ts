import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { ENTRY_GONE } from "@/lib/entry-gone";

type BilledCtx = { prisma: PrismaClient; userId: string };

/** The number of the user's invoice, or "an invoice" when the row cannot be read. */
export async function billedInvoiceNumber(ctx: BilledCtx, invoiceId: string): Promise<string> {
  const invoice = await ctx.prisma.invoice.findFirst({
    where: { id: invoiceId, user_id: ctx.userId },
    select: { number: true },
  });
  return invoice?.number ?? "an invoice";
}

/**
 * Why an entry may not gain or lose minutes or change client: it is on an invoice. Billing takes only unbilled rows,
 * so time added to a billed row would never be billed. Null when the entry is not on an invoice.
 */
export async function billedLockMessage(ctx: BilledCtx, entry: { invoice_id?: string | null }): Promise<string | null> {
  if (!entry.invoice_id) return null;
  return `This entry is on invoice ${await billedInvoiceNumber(ctx, entry.invoice_id)}. Add a new entry for the extra time.`;
}

/** Clears a day's single entry for `bulkSet`. True when deleted, false when it is on an invoice (the day is skipped). */
export async function deleteUnbilledDay(ctx: BilledCtx, entry: { id: string; invoice_id: string | null }) {
  if (entry.invoice_id) return false;
  await ctx.prisma.timeEntry.deleteMany({ where: { id: entry.id, user_id: ctx.userId, invoice_id: null } });
  return true;
}

/**
 * Deletes one of the user's entries unless it is on an invoice (one statement, so a race cannot slip past).
 * Throws NOT_FOUND when the entry is gone and BAD_REQUEST naming the invoice when it is billed.
 */
export async function deleteUnbilledEntry(ctx: BilledCtx, id: string): Promise<void> {
  const { count } = await ctx.prisma.timeEntry.deleteMany({ where: { id, user_id: ctx.userId, invoice_id: null } });
  if (count > 0) return;
  const entry = await ctx.prisma.timeEntry.findFirst({
    where: { id, user_id: ctx.userId },
    select: { invoice_id: true },
  });
  if (!entry?.invoice_id) throw new TRPCError({ code: "NOT_FOUND", message: ENTRY_GONE });
  const number = await billedInvoiceNumber(ctx, entry.invoice_id);
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `This entry is on invoice ${number}, so it can't be deleted. Delete the invoice first to free its time.`,
  });
}
