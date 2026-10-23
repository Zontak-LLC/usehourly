import { describe, expect, it, vi } from "vitest";

import type { InvoiceSnapshot } from "@/lib/invoice";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import {
  CURRENCIES,
  currencyOrDefault,
  currencySymbol,
  excelMoneyFormat,
  formatMoney,
  formatMoneyForPdf,
} from "@/lib/money";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryNonBillableDays } from "./helpers/memory-non-billable";

const createCaller = createCallerFactory(appRouter);

/** One account in a given currency with a given number of invoices already made. */
function setup(currency: string, invoices = 0, hourlyRate = 10000) {
  const prisma = {
    ...memoryNonBillableDays(),
    client: {
      findFirst: vi.fn(async () => ({ id: "c1", name: "Acme", legal_name: null, address: null, logo: null })),
    },
    timeEntry: {
      // Marks the entries an invoice bills (migration 0035); answers how many it marked.
      updateMany: vi.fn(async (a?: { where?: { id?: { in?: unknown[] } } }) => ({
        count: a?.where?.id?.in?.length ?? 0,
      })),
      findMany: vi.fn(async () => [
        {
          date: "2026-10-02",
          minutes: 90,
          note: "homepage hero",
          started_at: null,
          project_id: "p1",
          project: { name: "Website", hourly_rate: hourlyRate, billable: true },
        },
      ]),
    },
    invoice: {
      findFirst: vi.fn(async () => null),
      count: vi.fn(async () => invoices),
      create: vi.fn(async (_a: { data: { snapshot: string } }) => ({ id: "inv1" })),
    },
    authUser: {
      findUnique: vi.fn(async () => ({
        id: "u1",
        name: "Jo",
        email: "jo@example.com",
        currency,
        business_name: "Jo Design LLC",
        ein: null,
        address: null,
        logo: null,
        payment_instructions: null,
        invoice_branding: true,
      })),
      update: vi.fn(async () => ({ id: "u1" })),
    },
  };
  const caller = createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });
  return { prisma, caller };
}

const input = { clientId: "c1", from: "2026-10-01", to: "2026-10-31", number: "INV-1", issueDate: "2026-11-01" };

const snapshot = (over: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot => ({
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

describe("money is written in the account's currency", () => {
  it("formats the same amount per currency, and treats anything unknown as US dollars", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(123456, "USD")).toBe("$1,234.56");
    expect(formatMoney(123456, "EUR")).toBe("€1,234.56");
    expect(formatMoney(123456, "GBP")).toBe("£1,234.56");
    expect(formatMoney(123456, "CHF")).toContain("1,234.56");
    expect(formatMoney(123456, "CHF")).toContain("CHF");
    expect(formatMoney(123456, "SEK")).toContain("1,234.56");
    expect(formatMoney(123456, "nonsense")).toBe("$1,234.56");
    expect(currencyOrDefault(undefined)).toBe("USD");
    expect(currencyOrDefault("JPY")).toBe("USD"); // zero-decimal currencies are not offered yet
  });

  it("offers only two-decimal currencies, each of which formats with two decimals and has a symbol", () => {
    for (const c of CURRENCIES) {
      expect(formatMoney(100, c.code)).toMatch(/1\.00$/);
      expect(currencySymbol(c.code).length).toBeGreaterThan(0);
    }
    expect(currencySymbol("EUR")).toBe("€");
    expect(excelMoneyFormat("EUR")).toBe('"€"#,##0.00');
    expect(excelMoneyFormat()).toBe('"$"#,##0.00');
    expect(formatMoneyForPdf(15000, "EUR")).toBe("EUR\u00a0150.00");
    expect(formatMoneyForPdf(15000, "USD")).toBe("$150.00");
  });
});

describe("choosing a currency", () => {
  it("is saved on the signed-in account only, and me() says whether it is still changeable", async () => {
    const { prisma, caller } = setup("USD", 0);
    expect(await caller.account.setCurrency({ currency: "EUR" })).toEqual({ currency: "EUR" });
    expect(prisma.authUser.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { currency: "EUR" } });
  });

  it("is locked once the account has an invoice: refused with a plain reason, nothing written", async () => {
    const { prisma, caller } = setup("USD", 2);
    await expect(caller.account.setCurrency({ currency: "GBP" })).rejects.toThrow(
      /fixed once you have made an invoice/,
    );
    expect(prisma.authUser.update).not.toHaveBeenCalled();
    // choosing the one it already has is never a change
    expect(await caller.account.setCurrency({ currency: "USD" })).toEqual({ currency: "USD" });
    expect(prisma.authUser.update).not.toHaveBeenCalled();
  });

  it("refuses a currency that is not offered, and a signed-out caller; the database is not touched", async () => {
    const { prisma, caller } = setup("USD", 0);
    await expect(caller.account.setCurrency({ currency: "JPY" as never })).rejects.toThrow();
    await expect(caller.account.setCurrency({ currency: "xyz" as never })).rejects.toThrow();
    const signedOut = createCaller({ session: null, prisma: prisma as never });
    await expect(signedOut.account.setCurrency({ currency: "EUR" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(prisma.authUser.update).not.toHaveBeenCalled();
  });
});

describe("an invoice carries its currency", () => {
  it("freezes the account's currency into the snapshot when it is made", async () => {
    const { prisma, caller } = setup("EUR", 0);
    const made = await caller.invoice.create(input);
    expect(made.snapshot.currency).toBe("EUR");
    expect(JSON.parse(prisma.invoice.create.mock.calls[0][0].data.snapshot).currency).toBe("EUR");
  });

  it("prints that currency in the PDF; an older invoice with no currency stays in US dollars", async () => {
    // the PDF's own font has no euro or rupee sign, so those amounts carry the code instead of a lost symbol
    const eur = (await buildInvoicePdf(snapshot({ currency: "EUR" }))).output();
    expect(eur).toContain("EUR\u00a0150.00");
    expect(eur).not.toContain("$150.00");
    expect((await buildInvoicePdf(snapshot({ currency: "INR" }))).output()).toContain("INR\u00a0150.00");
    expect((await buildInvoicePdf(snapshot({ currency: "GBP" }))).output()).toContain("£150.00");
    const legacy = (await buildInvoicePdf(snapshot())).output();
    expect(legacy).toContain("$150.00");
  });

  it("names the account's currency when every rate is zero", async () => {
    const { caller } = setup("EUR", 0, 0);
    await expect(caller.invoice.create(input)).rejects.toThrow(/€0\.00/);
  });
});
