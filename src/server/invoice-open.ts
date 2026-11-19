import { buildSearchText, type InvoiceSnapshot } from "@/lib/invoice";

import { withInvoiceLogos } from "./invoice-logos";
import type { Context } from "./trpc";

type StoredInvoice = { id: string; client_id: string | null; snapshot: string; paid_date: string | null };

/**
 * One invoice as the screens read it (`invoice.get`, `invoice.latest`): its frozen snapshot, old ones backfilled once,
 * with the logos put back. Returns the id, the paid date and the snapshot. Writes only when a backfill was needed.
 */
export async function openInvoice(ctx: Pick<Context, "prisma"> & { userId: string }, inv: StoredInvoice) {
  const snapshot = JSON.parse(inv.snapshot) as InvoiceSnapshot;

  // Invoices issued before clients had a full name / address / logo have none of those keys
  // (a deliberately empty value is stored as null, not absent). Backfill them once from the
  // client's current details and freeze the result, so the old PDF isn't stuck without them.
  const legacy = !("legalName" in snapshot.client) && !("address" in snapshot.client) && !("logo" in snapshot.client);
  if (legacy && inv.client_id) {
    const client = await ctx.prisma.client.findFirst({ where: { id: inv.client_id, user_id: ctx.userId } });
    if (client) {
      snapshot.client = {
        ...snapshot.client,
        legalName: client.legal_name,
        address: client.address,
        logo: client.logo,
      };
      await ctx.prisma.invoice.update({
        where: { id: inv.id, user_id: ctx.userId },
        data: { snapshot: JSON.stringify(snapshot), search_text: buildSearchText(snapshot) },
      });
    }
  }

  // Invoices issued before "how to pay" existed have no such key (an empty value is stored as
  // null). Backfill once from the account's current instructions and freeze the result.
  if (!("paymentInstructions" in snapshot.seller)) {
    const user = await ctx.prisma.authUser.findUnique({
      where: { id: ctx.userId },
      select: { payment_instructions: true },
    });
    snapshot.seller = { ...snapshot.seller, paymentInstructions: user?.payment_instructions ?? null };
    await ctx.prisma.invoice.update({
      where: { id: inv.id, user_id: ctx.userId },
      data: { snapshot: JSON.stringify(snapshot) },
    });
  }
  return {
    id: inv.id,
    paidDate: inv.paid_date,
    snapshot: await withInvoiceLogos(ctx.prisma, ctx.userId, snapshot),
  };
}
