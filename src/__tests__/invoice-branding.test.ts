import { describe, expect, it, vi } from "vitest";

import type { InvoiceSnapshot } from "@/lib/invoice";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryNonBillableDays } from "./helpers/memory-non-billable";

const createCaller = createCallerFactory(appRouter);

function setup(invoiceBranding: boolean) {
  const prisma = {
    ...memoryNonBillableDays(),
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

describe("invoices carry no UseHourly credit", () => {
  it("a new invoice is frozen with no branding key", async () => {
    const { prisma, caller } = setup(true);
    const made = await caller.invoice.create(input);
    expect("branding" in made.snapshot).toBe(false);
    expect("branding" in JSON.parse(prisma.invoice.create.mock.calls[0][0].data.snapshot)).toBe(false);
  });

  it("the PDF prints no credit or link, even for an old snapshot that still says branding", async () => {
    const legacy = (await buildInvoicePdf(baseSnapshot({ branding: true } as never))).output();
    expect(legacy).not.toContain("Made with UseHourly");
    expect(legacy).toContain("INV-1");
  });

  it("the setting is gone from the account API", () => {
    expect("setInvoiceBranding" in (appRouter._def.procedures as object)).toBe(false);
    expect(Object.keys(appRouter._def.procedures)).not.toContain("account.setInvoiceBranding");
  });

  it("long invoices print no credit on any page", async () => {
    const detail = Array.from({ length: 90 }, (_, i) => ({
      date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
      project: "Website",
      note: `task ${i}`,
      minutes: 30,
    }));
    const doc = await buildInvoicePdf(baseSnapshot({ includeDetail: true, detail }));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(doc.output()).not.toContain("Made with UseHourly");
  });
});
