import { vi } from "vitest";

import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { markingMock } from "./marking-mock";
import { memoryNonBillableDays } from "./memory-non-billable";
import { memoryRateLimit } from "./memory-rate-limit";

/** A tRPC caller for the whole app router, given a session and a (fake) Prisma client. */
export const createCaller = createCallerFactory(appRouter);

/** The tax columns of an account row. */
export type Tax = { tax_name: string | null; tax_rate: number | null; tax_number: string | null };

/** An account with no tax set. */
export const NO_TAX: Tax = { tax_name: null, tax_rate: null, tax_number: null };

/** An account charging VAT at 20%, with a VAT number. */
export const VAT: Tax = { tax_name: "VAT", tax_rate: 2000, tax_number: "GB123456789" };

/** The invoice asked for in every case: Acme for October 2026. */
export const input = { clientId: "c1", from: "2026-10-01", to: "2026-10-31", number: "INV-1", issueDate: "2026-11-01" };

/**
 * One account (in euros) with 1:30 at €100/h for Acme, and the given tax settings. Returns the fake `prisma` (its
 * methods are spies) and a caller signed in as that account.
 */
export function setup(tax: Tax = NO_TAX) {
  const prisma = {
    ...memoryNonBillableDays(),
    ...memoryRateLimit(),
    client: {
      findFirst: vi.fn(async () => ({ id: "c1", name: "Acme", legal_name: null, address: null, logo: null })),
    },
    timeEntry: {
      ...markingMock(),
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
