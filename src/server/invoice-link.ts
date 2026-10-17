import type { PrismaClient } from "@prisma/client";

import { hashToken, newToken } from "@/lib/email-token";
import { MAX_LIVE_LINKS, MAX_LIVE_LINKS_PER_INVOICE } from "@/lib/invoice-link";

/** The link a token points at, whatever state it is in, or null if no such link exists. The token is only ever hashed. */
export async function findInvoiceLinkByToken(prisma: Pick<PrismaClient, "invoiceLink">, token: string) {
  if (token.length < 20 || token.length > 100) return null;
  return prisma.invoiceLink.findUnique({ where: { token_hash: await hashToken(token) } });
}

/** What stops someone making one more link, in words. */
export class LinkLimitError extends Error {}

/**
 * Makes a private link to an invoice of this account and returns the token (shown once; only its hash is stored).
 * Throws LinkLimitError when the invoice or the account is already at its limit of live links.
 */
export async function createInvoiceLink(
  prisma: Pick<PrismaClient, "invoiceLink">,
  userId: string,
  invoiceId: string,
  expiresInDays: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ id: string; token: string }> {
  const live = { revoked_at: null, expires_at: { gt: nowSeconds } };
  const [onInvoice, overall] = await Promise.all([
    prisma.invoiceLink.count({ where: { user_id: userId, invoice_id: invoiceId, ...live } }),
    prisma.invoiceLink.count({ where: { user_id: userId, ...live } }),
  ]);
  if (onInvoice >= MAX_LIVE_LINKS_PER_INVOICE) {
    throw new LinkLimitError(`This invoice already has ${MAX_LIVE_LINKS_PER_INVOICE} live links. Turn one off first.`);
  }
  if (overall >= MAX_LIVE_LINKS) {
    throw new LinkLimitError(`You have ${MAX_LIVE_LINKS} live invoice links. Turn some off first.`);
  }
  const token = newToken();
  const row = await prisma.invoiceLink.create({
    data: {
      user_id: userId,
      invoice_id: invoiceId,
      token_hash: await hashToken(token),
      token_prefix: token.slice(0, 6),
      expires_at: nowSeconds + expiresInDays * 86_400,
    },
    select: { id: true },
  });
  return { id: row.id, token };
}
