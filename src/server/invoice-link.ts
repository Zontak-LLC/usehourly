import type { PrismaClient } from "@prisma/client";

import { hashToken } from "@/lib/email-token";

/** The link a token points at, whatever state it is in, or null if no such link exists. The token is only ever hashed. */
export async function findInvoiceLinkByToken(prisma: Pick<PrismaClient, "invoiceLink">, token: string) {
  if (token.length < 20 || token.length > 100) return null;
  return prisma.invoiceLink.findUnique({ where: { token_hash: await hashToken(token) } });
}
