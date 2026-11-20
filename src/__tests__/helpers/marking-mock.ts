import { vi } from "vitest";

type MarkArgs = {
  where?: { id?: { in?: unknown[] }; invoice_id?: string | null };
  data?: { invoice_id?: string | null };
};
type CountArgs = { where?: { invoice_id?: string | null } };

/**
 * `timeEntry.updateMany` and `timeEntry.count` for a prisma mock that does not store its entries. Marking answers that
 * every id it was given was marked; counting by invoice answers how many ids were marked on that invoice (what
 * `invoice.create` reads back to tell a clash), and undoing an invoice frees them. Any other count answers
 * `otherCount` (the account's entries, for the limits).
 */
export function markingMock(otherCount = 0) {
  const markedOn = new Map<string, number>();
  return {
    updateMany: vi.fn(async (args?: MarkArgs) => {
      const count = args?.where?.id?.in?.length ?? 0;
      const invoiceId = args?.data?.invoice_id;
      if (invoiceId) markedOn.set(invoiceId, (markedOn.get(invoiceId) ?? 0) + count);
      const freed = args?.where?.invoice_id;
      if (invoiceId === null && freed) markedOn.delete(freed);
      return { count };
    }),
    count: vi.fn(async (args?: CountArgs) => {
      const invoiceId = args?.where?.invoice_id;
      return invoiceId ? (markedOn.get(invoiceId) ?? 0) : otherCount;
    }),
  };
}
