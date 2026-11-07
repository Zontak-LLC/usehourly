import { describe, expect, it, vi } from "vitest";

import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryInvoiceLogos } from "./helpers/memory-invoice-logos";
import { memoryNonBillableDays } from "./helpers/memory-non-billable";

/*
 * New invoice shows a preview before anything is saved (2026-11-06, Userbrain first-day sessions). `invoice.preview`
 * and `invoice.create` share one snapshot builder (`server/invoice-snapshot.ts`), so what is checked is what is saved.
 * The tables below answer only for the account a query names, so a dropped owner filter shows up as a leak.
 */

const createCaller = createCallerFactory(appRouter);

const users = {
  u1: { id: "u1", name: "Jo Freelance", email: "jo@example.com", business_name: "Jo Design LLC", currency: "USD" },
  u2: { id: "u2", name: "Someone Else", email: "else@example.com", business_name: "", currency: "USD" },
};
const clients = [
  { id: "c1", user_id: "u1", name: "Acme Studio", logo: "data:image/png;base64,AAAA" },
  { id: "c2", user_id: "u2", name: "Not yours", logo: null },
];
type Entry = { id: string; user_id: string; client_id: string; date: string; minutes: number; rate: number };

function memoryDb(entries: Entry[]) {
  const invoices: { id: string; user_id: string; number: string }[] = [];
  const invoiceIds = new Map<string, string>(); // entry id -> invoice id
  const ownClient = ({ where }: { where: { id: string; user_id: string } }) =>
    // A query without `user_id` gets any account's row, as the real table would give it.
    clients.find((c) => c.id === where.id && (where.user_id === undefined || c.user_id === where.user_id)) ?? null;
  return {
    invoiceRows: invoices,
    invoiceIds,
    ...memoryInvoiceLogos(),
    ...memoryNonBillableDays(),
    client: { findFirst: vi.fn(async (a: { where: { id: string; user_id: string } }) => ownClient(a)) },
    authUser: { findUnique: vi.fn(async ({ where }: { where: { id: keyof typeof users } }) => users[where.id]) },
    timeEntry: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { user_id: string; date: { gte: string; lte: string }; project: { client_id: string } };
        }) =>
          entries
            .filter(
              (e) =>
                (where.user_id === undefined || e.user_id === where.user_id) &&
                e.client_id === where.project.client_id &&
                e.date >= where.date.gte &&
                e.date <= where.date.lte &&
                !invoiceIds.has(e.id),
            )
            .map((e) => ({
              ...e,
              note: "",
              started_at: null,
              project_id: "p1",
              project: { name: "General", hourly_rate: e.rate, billable: true },
            })),
      ),
      updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: { invoice_id: string } }) => {
        for (const id of where.id.in) invoiceIds.set(id, data.invoice_id);
        return { count: where.id.in.length };
      }),
    },
    invoice: {
      count: vi.fn(
        async ({ where }: { where: { user_id: string } }) => invoices.filter((i) => i.user_id === where.user_id).length,
      ),
      findFirst: vi.fn(
        async ({ where }: { where: { user_id: string; number: string } }) =>
          invoices.find((i) => i.user_id === where.user_id && i.number === where.number) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: { user_id: string; number: string } }) => {
        const row = { id: `inv${invoices.length + 1}`, user_id: data.user_id, number: data.number };
        invoices.push(row);
        return { id: row.id };
      }),
    },
  };
}

const asCaller = (db: ReturnType<typeof memoryDb>, userId: string) =>
  createCaller({ session: { user: { id: userId }, expires: "" }, prisma: db as never });

const input = {
  clientId: "c1",
  from: "2026-11-01",
  to: "2026-11-30",
  number: "INV-2026-001",
  issueDate: "2026-11-06",
  dueDate: "2026-12-06",
  notes: "Thank you!",
};
// The first-day seed: 3 hours at $60.
const threeHours = (): Entry[] => [
  { id: "e1", user_id: "u1", client_id: "c1", date: "2026-11-05", minutes: 120, rate: 6000 },
  { id: "e2", user_id: "u1", client_id: "c1", date: "2026-11-05", minutes: 60, rate: 6000 },
];

describe("Preview invoice: the invoice Save would make, with nothing saved", () => {
  it("shows the same lines, totals and number as create, and writes no invoice, no invoice_id and no logo", async () => {
    const db = memoryDb(threeHours());
    const { snapshot: preview } = await asCaller(db, "u1").invoice.preview(input);
    expect(preview.totalCents).toBe(18000);
    expect(preview.number).toBe("INV-2026-001");
    expect(preview.client.name).toBe("Acme Studio");
    expect(preview.client.logo).toBe("data:image/png;base64,AAAA"); // drawn inline, like create's answer
    expect(db.invoiceRows).toEqual([]);
    expect(db.invoiceIds.size).toBe(0);
    expect(db.logoRows).toEqual([]); // hashing only: storing a logo is a write
    expect(db.invoice.create).not.toHaveBeenCalled();
    expect(db.timeEntry.updateMany).not.toHaveBeenCalled();

    const { snapshot: saved } = await asCaller(db, "u1").invoice.create(input);
    expect(saved).toEqual(preview); // one builder: the same lines, totals, number, logos and hashes
    expect(db.invoiceRows).toHaveLength(1);
    expect(db.invoiceIds.size).toBe(2);
  });

  it("refuses another account's client with the same words as create", async () => {
    const db = memoryDb([{ id: "x1", user_id: "u2", client_id: "c2", date: "2026-11-05", minutes: 60, rate: 6000 }]);
    const theirs = { ...input, clientId: "c2" };
    await expect(asCaller(db, "u1").invoice.preview(theirs)).rejects.toThrow("Client not found.");
    await expect(asCaller(db, "u1").invoice.create(theirs)).rejects.toThrow("Client not found.");
    expect(db.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it("refuses a $0 total with the same words as create", async () => {
    const db = memoryDb([{ id: "e1", user_id: "u1", client_id: "c1", date: "2026-11-05", minutes: 60, rate: 0 }]);
    const words = /so the invoice would be \$0\.00\. Set the rates under Clients first\./;
    await expect(asCaller(db, "u1").invoice.preview(input)).rejects.toThrow(words);
    await expect(asCaller(db, "u1").invoice.create(input)).rejects.toThrow(words);
  });

  it("refuses nothing to bill and a number already used, like create", async () => {
    const empty = memoryDb([]);
    await expect(asCaller(empty, "u1").invoice.preview(input)).rejects.toThrow(/No billable time for this client/);
    const db = memoryDb(threeHours());
    await asCaller(db, "u1").invoice.create(input);
    await expect(asCaller(db, "u1").invoice.preview(input)).rejects.toThrow(
      "Invoice number INV-2026-001 is already used.",
    );
  });
});
