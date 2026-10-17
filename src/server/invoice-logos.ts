import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import type { InvoiceSnapshot } from "@/lib/invoice";
import { sha256Hex } from "@/lib/sha256";

/**
 * Invoice logos live in their own table, once per distinct image, and a snapshot points at them by
 * hash. Copying both logos into every invoice (up to 300 KB each) let one account fill the shared
 * database with a loop of invoices.
 */
export const MAX_INVOICE_LOGOS = 30; // distinct images one account may keep for invoices

type Db = Pick<PrismaClient, "invoiceLogo" | "invoice">;

/** Make sure this logo is stored for the user and return its hash (null when there is no logo). */
export async function storeInvoiceLogo(db: Db, userId: string, dataUrl: string | null): Promise<string | null> {
  if (!dataUrl) return null;
  const hash = await sha256Hex(dataUrl);
  if (await db.invoiceLogo.findFirst({ where: { user_id: userId, hash }, select: { id: true } })) return hash;
  if ((await db.invoiceLogo.count({ where: { user_id: userId } })) >= MAX_INVOICE_LOGOS) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Your invoices already use ${MAX_INVOICE_LOGOS} different logos. Delete some old invoices before using a new logo.`,
    });
  }
  try {
    await db.invoiceLogo.create({ data: { user_id: userId, hash, data: dataUrl } });
  } catch (e) {
    if ((e as { code?: string } | null)?.code !== "P2002") throw e; // stored a moment ago by a parallel call
  }
  return hash;
}

/** The snapshot with its logos filled back in from the table (old snapshots carry theirs inline). */
export async function withInvoiceLogos(db: Db, userId: string, snapshot: InvoiceSnapshot): Promise<InvoiceSnapshot> {
  const wanted = [
    snapshot.seller.logo ? null : snapshot.seller.logoHash,
    snapshot.client.logo ? null : snapshot.client.logoHash,
  ].filter((h): h is string => Boolean(h));
  if (wanted.length === 0) return snapshot;
  const rows = await db.invoiceLogo.findMany({ where: { user_id: userId, hash: { in: wanted } } });
  const byHash = new Map(rows.map((r) => [r.hash, r.data]));
  return {
    ...snapshot,
    seller: { ...snapshot.seller, logo: snapshot.seller.logo ?? byHash.get(snapshot.seller.logoHash ?? "") ?? null },
    client: { ...snapshot.client, logo: snapshot.client.logo ?? byHash.get(snapshot.client.logoHash ?? "") ?? null },
  };
}

/** The logo hashes a snapshot points at. */
export const logoHashesOf = (snapshot: InvoiceSnapshot): string[] =>
  [snapshot.seller.logoHash, snapshot.client.logoHash].filter((h): h is string => Boolean(h));

/** Drop stored logos that no remaining invoice of this user uses (call after deleting an invoice). */
export async function releaseUnusedInvoiceLogos(db: Db, userId: string, hashes: string[]): Promise<void> {
  for (const hash of new Set(hashes)) {
    const stillUsed = await db.invoice.findFirst({
      where: { user_id: userId, snapshot: { contains: hash } },
      select: { id: true },
    });
    if (!stillUsed) await db.invoiceLogo.deleteMany({ where: { user_id: userId, hash } });
  }
}
