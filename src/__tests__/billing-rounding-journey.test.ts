import { describe, expect, it, vi } from "vitest";

import { buildInvoice } from "@/lib/invoice";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { billedMinutes, describeRounding } from "@/lib/rounding";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryInvoiceLogos } from "./helpers/memory-invoice-logos";

const createCaller = createCallerFactory(appRouter);

const entry = (date: string, minutes: number) => ({
  date,
  minutes,
  note: "",
  started_at: null,
  project_id: "p1",
  project: { name: "Website", hourly_rate: 10000, billable: true },
});

function mockPrisma(round: { round_step: number; round_mode: string; round_min: number }) {
  return {
    ...memoryInvoiceLogos(),
    client: {
      findFirst: vi.fn(async () => ({ id: "c1", name: "Acme", legal_name: null, address: null, logo: null, ...round })),
      update: vi.fn(async () => ({ id: "c1" })),
    },
    timeEntry: {
      findMany: vi.fn(async () => [entry("2026-10-02", 7), entry("2026-10-03", 20), entry("2026-10-04", 61)]),
    },
    invoice: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (_a: { data: Record<string, string> }) => ({ id: "inv1" })),
      count: vi.fn(async () => 0),
    },
    authUser: {
      findUnique: vi.fn(async () => ({ id: "u1", name: "Jo", email: "jo@example.com", logo: null })),
    },
  };
}
const asOwner = (prisma: ReturnType<typeof mockPrisma>) =>
  createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });

const base = {
  clientId: "c1",
  from: "2026-10-01",
  to: "2026-10-31",
  number: "INV-1",
  issueDate: "2026-10-31",
  dueDate: null,
  notes: "",
  includeDetail: true,
};

describe("billing rounding", () => {
  it("rounds each entry up to 15 minutes, bills the rounded total and records what was logged", async () => {
    const prisma = mockPrisma({ round_step: 15, round_mode: "up", round_min: 0 });
    const { snapshot } = await asOwner(prisma).invoice.create(base);
    // 7 -> 15, 20 -> 30, 61 -> 75 = 120 billed; 88 logged
    expect(snapshot.detail.map((d) => d.minutes)).toEqual([15, 30, 75]);
    expect(snapshot.totalMinutes).toBe(120);
    expect(snapshot.loggedMinutes).toBe(88);
    expect(snapshot.totalCents).toBe(20000);
    expect(snapshot.rounding).toEqual({ step: 15, mode: "up", min: 0 });
    // the stored entries are read, never written
    expect(Object.keys(prisma.timeEntry)).toEqual(["findMany"]);
    expect(JSON.parse(prisma.invoice.create.mock.calls[0][0].data.snapshot).rounding.step).toBe(15);
    // the PDF builds with the rule printed
    expect(buildInvoicePdf(snapshot)).toBeTruthy();
  });

  it("nearest and a minimum behave as described; no rule leaves minutes exact and adds no rounding note", async () => {
    expect(billedMinutes(7, { step: 15, mode: "nearest", min: 0 })).toBe(0);
    expect(billedMinutes(8, { step: 15, mode: "nearest", min: 0 })).toBe(15);
    expect(billedMinutes(20, { step: 15, mode: "nearest", min: 30 })).toBe(30);
    expect(billedMinutes(0, { step: 15, mode: "up", min: 30 })).toBe(0); // a just-started timer bills nothing
    expect(describeRounding({ step: 6, mode: "nearest", min: 15 })).toBe(
      "Time is rounded to the nearest 6 minutes, with a minimum of 15 minutes per entry.",
    );

    const prisma = mockPrisma({ round_step: 0, round_mode: "up", round_min: 0 });
    const { snapshot } = await asOwner(prisma).invoice.create(base);
    expect(snapshot.totalMinutes).toBe(88);
    expect(snapshot.rounding).toBeUndefined();
    expect(buildInvoice([entry("2026-10-02", 7) as never]).loggedMinutes).toBe(7);
  });

  it("saves the rule only for the owner's client and refuses values outside the choices", async () => {
    const prisma = mockPrisma({ round_step: 0, round_mode: "up", round_min: 0 });
    const c = asOwner(prisma);
    const upd = { id: "c1", name: "Acme", legalName: "", address: "", logo: null };
    await c.clients.update({ ...upd, rounding: { step: 30, mode: "nearest", min: 15 } });
    expect(prisma.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ round_step: 30, round_mode: "nearest", round_min: 15 }),
      }),
    );
    prisma.client.update.mockClear();
    await expect(c.clients.update({ ...upd, rounding: { step: 7, mode: "up", min: 0 } })).rejects.toThrow();
    expect(prisma.client.update).not.toHaveBeenCalled();
  });
});
