import type { PrismaClient } from "@prisma/client";

/**
 * The dates the account has marked non-billable, optionally only those in [from, to]. Always filtered by the account
 * (that filter is the isolation boundary), so one account can never see or affect another's days.
 */
export async function nonBillableDates(
  prisma: PrismaClient,
  userId: string,
  range?: { from: string; to: string },
): Promise<Set<string>> {
  const rows = await prisma.nonBillableDay.findMany({
    where: { user_id: userId, ...(range ? { date: { gte: range.from, lte: range.to } } : {}) },
    select: { date: true },
  });
  return new Set(rows.map((r) => r.date));
}
