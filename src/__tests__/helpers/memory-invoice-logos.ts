import { vi } from "vitest";

type Row = { id: string; user_id: string; hash: string; data: string };

/** A stand-in for the invoice_logos table, so tests see what is really stored and for whom. */
export function memoryInvoiceLogos() {
  const rows: Row[] = [];
  return {
    logoRows: rows,
    invoiceLogo: {
      findFirst: vi.fn(
        async ({ where }: { where: { user_id: string; hash: string } }) =>
          rows.find((r) => r.user_id === where.user_id && r.hash === where.hash) ?? null,
      ),
      count: vi.fn(
        async ({ where }: { where: { user_id: string } }) => rows.filter((r) => r.user_id === where.user_id).length,
      ),
      create: vi.fn(async ({ data }: { data: { user_id: string; hash: string; data: string } }) => {
        const row = { id: `logo${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: { where: { user_id: string; hash: { in: string[] } } }) =>
        rows.filter((r) => r.user_id === where.user_id && where.hash.in.includes(r.hash)),
      ),
      deleteMany: vi.fn(async ({ where }: { where: { user_id: string; hash: string } }) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].user_id === where.user_id && rows[i].hash === where.hash) rows.splice(i, 1);
        }
        return { count: before - rows.length };
      }),
    },
  };
}
