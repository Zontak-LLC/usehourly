import { describe, expect, it, vi } from "vitest";

import type { InvoiceSnapshot } from "@/lib/invoice";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { formatTaxRate, invoiceTax, parseTaxRate, taxCents, taxNumberLabel, taxRateInput } from "@/lib/tax";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryNonBillableDays } from "./helpers/memory-non-billable";

/**
 * Localisation step 4 (issue #71): a freelancer who charges VAT (or GST, or sales tax) sets it once on Account, and each
 * new invoice adds it on top of the hours, prints the tax number, and freezes all of it into the snapshot.
 */
const createCaller = createCallerFactory(appRouter);

type Tax = { tax_name: string | null; tax_rate: number | null; tax_number: string | null };
const NO_TAX: Tax = { tax_name: null, tax_rate: null, tax_number: null };

/** One account (in euros) with 1:30 at €100/h for Acme, and the given tax settings. */
function setup(tax: Tax = NO_TAX) {
  const prisma = {
    ...memoryNonBillableDays(),
    client: {
      findFirst: vi.fn(async () => ({ id: "c1", name: "Acme", legal_name: null, address: null, logo: null })),
    },
    timeEntry: {
      updateMany: vi.fn(async (a?: { where?: { id?: { in?: unknown[] } } }) => ({
        count: a?.where?.id?.in?.length ?? 0,
      })),
      findMany: vi.fn(async () => [
        {
          id: "e1",
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
      create: vi.fn(async (_a: { data: { snapshot: string; total_cents: number } }) => ({ id: "inv1" })),
    },
    authUser: {
      findUnique: vi.fn(async () => ({
        id: "u1",
        name: "Jo",
        email: "jo@example.com",
        currency: "EUR",
        business_name: "Jo Design Ltd",
        ein: null,
        address: null,
        logo: null,
        payment_instructions: null,
        invoice_branding: true,
        is_demo: false,
        ...tax,
      })),
      update: vi.fn(async () => ({ id: "u1" })),
    },
  };
  const caller = createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });
  return { prisma, caller };
}

const input = { clientId: "c1", from: "2026-10-01", to: "2026-10-31", number: "INV-1", issueDate: "2026-11-01" };
const VAT: Tax = { tax_name: "VAT", tax_rate: 2000, tax_number: "GB123456789" };

describe("the tax rules", () => {
  it("reads a rate the way people type it, and refuses anything that is not a percentage", () => {
    expect(parseTaxRate("20")).toEqual({ rate: 2000 });
    expect(parseTaxRate(" 7.5 % ")).toEqual({ rate: 750 });
    expect(parseTaxRate("8,25")).toEqual({ rate: 825 }); // a decimal comma, as most of Europe writes it
    expect(parseTaxRate("")).toEqual({ rate: 0 });
    expect(parseTaxRate("100")).toEqual({ rate: 10000 });
    expect(parseTaxRate("100.01")).toEqual({ error: "A tax rate can be at most 100%." });
    for (const bad of ["twenty", "-5", "1.234", "20%%", "1e2"]) expect(parseTaxRate(bad)).toHaveProperty("error");
    expect([2000, 750, 825, 5].map(formatTaxRate)).toEqual(["20%", "7.5%", "8.25%", "0.05%"]);
    expect([2000, 825, 0, null].map(taxRateInput)).toEqual(["20", "8.25", "", ""]);
  });

  it("works the tax out once on the subtotal, rounded to the nearest cent", () => {
    expect(taxCents(15000, 2000)).toBe(3000);
    expect(taxCents(12345, 825)).toBe(1018); // 1018.46 cents
    expect(taxCents(10, 750)).toBe(1); // 0.75 of a cent rounds up
    expect(invoiceTax(15000, { name: " GST ", rate: 1000 })).toEqual({ name: "GST", rate: 1000, cents: 1500 });
    expect(invoiceTax(15000, { name: null, rate: 500 })).toEqual({ name: "Tax", rate: 500, cents: 750 });
    expect(invoiceTax(15000, { name: "VAT", rate: 0 })).toBeNull();
    expect(invoiceTax(15000, { name: "VAT", rate: null })).toBeNull();
    expect(taxNumberLabel("VAT")).toBe("VAT number");
    expect(taxNumberLabel("")).toBe("Tax number");
  });
});

describe("setting the tax on Account", () => {
  it("saves the name, rate and number on the signed-in account; empty values clear them", async () => {
    const { prisma, caller } = setup();
    expect(await caller.account.setTax({ name: "VAT", rate: 2000, number: "GB123456789" })).toEqual({
      name: "VAT",
      rate: 2000,
      number: "GB123456789",
    });
    expect(prisma.authUser.update).toHaveBeenLastCalledWith({
      where: { id: "u1" },
      data: { tax_name: "VAT", tax_rate: 2000, tax_number: "GB123456789" },
      select: { id: true },
    });
    await caller.account.setTax({ name: "  ", rate: 0, number: "" });
    expect(prisma.authUser.update).toHaveBeenLastCalledWith({
      where: { id: "u1" },
      data: { tax_name: null, tax_rate: null, tax_number: null },
      select: { id: true },
    });
  });

  it("refuses a rate over 100%, a fractional basis point, an over-long name and a signed-out caller: nothing written", async () => {
    const { prisma, caller } = setup();
    await expect(caller.account.setTax({ name: "VAT", rate: 10001, number: "" })).rejects.toThrow(/at most 100%/);
    await expect(caller.account.setTax({ name: "VAT", rate: 20.5, number: "" })).rejects.toThrow();
    await expect(caller.account.setTax({ name: "V".repeat(31), rate: 2000, number: "" })).rejects.toThrow(/name/);
    await expect(caller.account.setTax({ name: "VAT", rate: 2000, number: "9".repeat(41) })).rejects.toThrow(/number/);
    const signedOut = createCaller({ session: null, prisma: prisma as never });
    await expect(signedOut.account.setTax({ name: "VAT", rate: 2000, number: "" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(prisma.authUser.update).not.toHaveBeenCalled();
  });
});

describe("an invoice with tax", () => {
  it("adds the account's tax on top of the lines and stores the total the client pays", async () => {
    const { prisma, caller } = setup(VAT);
    const made = await caller.invoice.create({ ...input, addTax: true });
    expect(made.snapshot.subtotalCents).toBe(15000);
    expect(made.snapshot.tax).toEqual({ name: "VAT", rate: 2000, cents: 3000 });
    expect(made.snapshot.totalCents).toBe(18000);
    expect(made.snapshot.seller.taxNumber).toEqual({ label: "VAT number", value: "GB123456789" });
    // the stored row (lists, totals, the year summary) holds what the client owes
    const data = prisma.invoice.create.mock.calls[0][0].data;
    expect(data.total_cents).toBe(18000);
    expect(JSON.parse(data.snapshot).tax).toEqual({ name: "VAT", rate: 2000, cents: 3000 });
  });

  it("leaves the tax off one invoice when asked, but still prints the tax number", async () => {
    const { prisma, caller } = setup(VAT);
    const made = await caller.invoice.create({ ...input, addTax: false });
    expect(made.snapshot.tax).toBeUndefined();
    expect(made.snapshot.subtotalCents).toBeUndefined();
    expect(made.snapshot.totalCents).toBe(15000);
    expect(made.snapshot.seller.taxNumber?.value).toBe("GB123456789");
    expect(prisma.invoice.create.mock.calls[0][0].data.total_cents).toBe(15000);
  });

  it("adds nothing for an account with no rate, and never takes a rate from the caller", async () => {
    const { caller } = setup(NO_TAX);
    const made = await caller.invoice.create({ ...input, addTax: true, rate: 5000 } as typeof input);
    expect(made.snapshot.tax).toBeUndefined();
    expect(made.snapshot.totalCents).toBe(15000);
    expect(made.snapshot.seller.taxNumber).toBeUndefined();
  });

  it("is unchanged for callers that do not ask (the MCP tool, older browsers)", async () => {
    const { caller } = setup(VAT);
    const made = await caller.invoice.create(input);
    expect(made.snapshot.tax).toBeUndefined();
    expect(made.snapshot.totalCents).toBe(15000);
  });
});

describe("the PDF", () => {
  const snapshot = (over: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot => ({
    currency: "GBP",
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

  it("prints the subtotal, the tax row, the total with tax and the seller's tax number", async () => {
    const pdf = (
      await buildInvoicePdf(
        snapshot({
          seller: {
            name: "Jo",
            ein: null,
            address: null,
            email: "jo@example.com",
            logo: null,
            taxNumber: { label: "VAT number", value: "GB123456789" },
          },
          subtotalCents: 15000,
          tax: { name: "VAT", rate: 2000, cents: 3000 },
          totalCents: 18000,
        }),
      )
    ).output();
    expect(pdf).toContain("Subtotal");
    expect(pdf).toContain("VAT \\(20%\\)"); // a PDF string escapes its brackets
    expect(pdf).toContain("£30.00");
    expect(pdf).toContain("£180.00");
    expect(pdf).toContain("VAT number GB123456789");
  });

  it("prints an invoice without tax (and every older one) exactly as before", async () => {
    const pdf = (await buildInvoicePdf(snapshot())).output();
    expect(pdf).not.toContain("Subtotal");
    expect(pdf).not.toContain("number GB");
    expect(pdf).toContain("£150.00");
  });
});
