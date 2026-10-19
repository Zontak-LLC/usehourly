import type { PrismaClient } from "@prisma/client";

/**
 * Removes an account and everything that belongs to it. Children go first and the account last, so a
 * failure half way leaves an account that can simply try again (nothing is orphaned and the person is
 * never half-deleted in a way they cannot finish). Throttle counters are keyed by address or connection
 * and expire on their own, so they are left to housekeeping.
 */
export async function deleteAccountData(prisma: PrismaClient, userId: string): Promise<void> {
  const mine = { where: { user_id: userId } };
  await prisma.oauthCode.deleteMany(mine);
  await prisma.apiToken.deleteMany(mine);
  await prisma.emailToken.deleteMany(mine);
  await prisma.timesheetShare.deleteMany(mine);
  await prisma.invoiceLink.deleteMany(mine);
  await prisma.invoiceEmail.deleteMany(mine);
  await prisma.invoiceLogo.deleteMany(mine);
  await prisma.invoice.deleteMany(mine);
  await prisma.nonBillableDay.deleteMany(mine);
  await prisma.timeEntry.deleteMany(mine);
  await prisma.project.deleteMany(mine);
  await prisma.client.deleteMany(mine);
  await prisma.authUser.delete({ where: { id: userId } });
}
