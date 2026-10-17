import type { PrismaClient } from "@prisma/client";

import { hashToken } from "@/lib/email-token";

/** The share a link points at, whatever state it is in, or null if no such link exists. The token is only ever hashed. */
export async function findShareByToken(prisma: Pick<PrismaClient, "timesheetShare">, token: string) {
  if (token.length < 20 || token.length > 100) return null;
  return prisma.timesheetShare.findUnique({ where: { token_hash: await hashToken(token) } });
}
