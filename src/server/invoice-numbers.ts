import type { PrismaClient } from "@prisma/client";

/**
 * The invoice number for each invoice id given, in one read of the caller's own invoices (an id that is not theirs is
 * simply absent). Reads nothing when there are no ids.
 */
export async function invoiceNumbersFor(
  db: PrismaClient,
  userId: string,
  invoiceIds: readonly (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(invoiceIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const rows = await db.invoice.findMany({
    where: { user_id: userId, id: { in: ids } },
    select: { id: true, number: true },
  });
  return new Map(rows.map((r) => [r.id, r.number]));
}
