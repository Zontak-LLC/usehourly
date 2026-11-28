import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { MAX_QUERY_DAYS, spanDays } from "@/lib/dates";
import { buildInvoice, isBilledEntry } from "@/lib/invoice";
import { effectiveCurrency } from "@/lib/money";

import { clientRounding, invoiceableEntries, invoiceClient } from "./invoice-snapshot";
import { dateSchema } from "./schemas/dates";

/** The same period rules as `invoice.create`, so a preview is never accepted for a period an invoice would refuse. */
export const unbilledTimeInput = z
  .object({ clientId: z.string(), from: dateSchema, to: dateSchema })
  .refine((v) => v.from <= v.to, { message: "The start date must be before the end date." })
  .refine((v) => spanDays(v.from, v.to) <= MAX_QUERY_DAYS, {
    message: `Choose a period of up to a year (${MAX_QUERY_DAYS} days).`,
  });

/**
 * What `invoice.create` would bill for a client and period, without making an invoice: the lines per project (the
 * client's rounding applied), the ids of the entries each line holds, and the total. It uses the same entry read, rounding
 * and invoice math as the invoice, so the two agree to the cent. No tax: an MCP invoice never adds any.
 * Nothing to bill is not an error: it returns no lines and 0. Only reads. Throws NOT_FOUND for a client that is not the caller's.
 */
export async function unbilledTime(db: PrismaClient, userId: string, input: z.infer<typeof unbilledTimeInput>) {
  const client = await invoiceClient(db, userId, input.clientId);
  const user = await db.authUser.findUnique({ where: { id: userId }, select: { currency: true } });
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
  const entries = await invoiceableEntries(db, userId, {
    client,
    from: input.from,
    to: input.to,
    includeInvoiced: false,
  });
  const totals = buildInvoice(entries, clientRounding(client));
  const entryIdsByProject: Record<string, string[]> = {};
  for (const e of entries.filter(isBilledEntry)) {
    entryIdsByProject[e.project_id] = [...(entryIdsByProject[e.project_id] ?? []), e.id];
  }
  return {
    currency: effectiveCurrency(client.currency, user.currency),
    lines: totals.lines,
    entryIdsByProject,
    totalMinutes: totals.totalMinutes,
    totalCents: totals.totalCents,
  };
}
