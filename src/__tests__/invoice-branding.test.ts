import { describe, expect, it, vi } from "vitest";

import type { InvoiceSnapshot } from "@/lib/invoice";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

function setup(invoiceBranding: boolean) {
  const prisma = {
    client: {
      findFirst: vi.fn(async () => ({ id: "c1", name: "Acme", legal_name: null, address: null, logo: null })),
    },
    timeEntry: {
      findMany: vi.fn(async () => [
        {
          date: "2026-10-02",
          minutes: 90,
          note: "homepage hero",
          started_at: null,
          project_id: "p1",
          project: { name: "Website", hourly_rate: 10000, billable: true },
        },
      ]),
    },
    invoice: {
      findFirst: vi.fn(async () => null),
      count: vi.fn(async () => 0),
      create: vi.fn(async (_a: { data: { snapshot: string } }) => ({ id: "inv1" })),
    },
    authUser: {
      findUnique: vi.fn(async () => ({
        id: "u1",
        name: "Jo",
        email: "jo@example.com",
        business_name: "Jo Design LLC",
        ein: null,
        address: null,
        logo: null,
        payment_instructions: null,
        invoice_branding: invoiceBranding,
      })),
      update: vi.fn(async () => ({ id: "u1" })),
    },
  };
  const caller = createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });
  return { prisma, caller };
}

const input = { clientId: "c1", from: "2026-10-01", to: "2026-10-31", number: "INV-1", issueDate: "2026-11-01" };

const baseSnapshot = (over: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot => ({
  seller: { name: "Jo", ein: null, address: null, email: "jo@example.com", logo: null },
  client: { name: "Acme" },
  number: "INV-1",
  issueDate: "2026-11-01",
  dueDate: null,
  periodFrom: "2026-10-01",
  periodTo: "2026-10-31",
  notes: "",
  includeDetail: false,
  lines: [{ projectId: "p1", project: "Website", minutes: 90, rateCents: 10000, amountCents: 15000 }],
  detail: [],
  totalMinutes: 90,
  totalCents: 15000,
  ...over,
});

describe("the optional 'Made with UseHourly' line on invoices", () => {
  it("is on for a new seller: the invoice is frozen with the setting at the moment it is issued", async () => {
    const { prisma, caller } = setup(true);
    const made = await caller.invoice.create(input);
    expect(made.snapshot.branding).toBe(true);
    const stored = JSON.parse(prisma.invoice.create.mock.calls[0][0].data.snapshot);
    expect(stored.branding).toBe(true);
  });

  it("stays off for a seller who turned it off, and changing it later does not rewrite issued invoices", async () => {
    const { prisma, caller } = setup(false);
    const made = await caller.invoice.create(input);
    expect(made.snapshot.branding).toBe(false);
    expect(JSON.parse(prisma.invoice.create.mock.calls[0][0].data.snapshot).branding).toBe(false);

    await caller.account.setInvoiceBranding({ enabled: true });
    expect(prisma.authUser.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { invoice_branding: true } });
    // the setting touches only the account row; no invoice is rewritten
    expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
  });

  it("prints a linked credit on every page when on, and nothing when off or for older invoices", async () => {
    const on = (await buildInvoicePdf(baseSnapshot({ branding: true }))).output();
    expect(on).toContain("Made with UseHourly");
    expect(on).toContain("usehourly.app");
    expect(on).toContain("/URI"); // a clickable link

    const off = (await buildInvoicePdf(baseSnapshot({ branding: false }))).output();
    expect(off).not.toContain("Made with UseHourly");

    // issued before the setting existed: no key at all, so it stays as it was sent
    const legacy = (await buildInvoicePdf(baseSnapshot())).output();
    expect(legacy).not.toContain("Made with UseHourly");
    expect(legacy).toContain("INV-1");
  });

  it("repeats the credit on each page of a long invoice", async () => {
    const detail = Array.from({ length: 90 }, (_, i) => ({
      date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
      project: "Website",
      note: `task ${i}`,
      minutes: 30,
    }));
    const doc = await buildInvoicePdf(baseSnapshot({ branding: true, includeDetail: true, detail }));
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThan(1);
    expect(doc.output().split("Made with UseHourly").length - 1).toBe(pages);
  });

  it("is settable only for the signed-in account, and signed-out callers are refused", async () => {
    const { prisma } = setup(true);
    const signedOut = createCaller({ session: null, prisma: prisma as never });
    await expect(signedOut.account.setInvoiceBranding({ enabled: false })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(prisma.authUser.update).not.toHaveBeenCalled();
  });
});
