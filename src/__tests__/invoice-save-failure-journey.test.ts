import { beforeEach, describe, expect, it, vi } from "vitest";

import { logError } from "@/lib/log";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryBillingDb } from "./helpers/memory-billing";

vi.mock("@/lib/log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/log")>()),
  logError: vi.fn(),
}));

/**
 * D1 fails while an invoice is being saved: the invoice row is written, then marking its time throws. Nothing may be
 * left behind (no invoice, no billed marks), so a retry with the same number works and the hours are billed once.
 */

const caller = (prisma: unknown, userId = "u1") =>
  createCallerFactory(appRouter)({ prisma, userId, session: { user: { id: userId } } } as never);

const october = {
  clientId: "c1",
  from: "2026-10-01",
  to: "2026-10-31",
  issueDate: "2026-11-01",
  dueDate: "2026-11-15",
  number: "2026-001",
};

const NETWORK_LOST = "D1_ERROR: network lost";
const MARK_GROUP = 80;

beforeEach(() => {
  vi.mocked(logError).mockClear();
});

describe("a save that fails while marking its time leaves nothing behind", () => {
  it("removes the invoice, frees all time, passes the error on, and the same number then works", async () => {
    const { prisma, entries, invoices } = memoryBillingDb();
    prisma.timeEntry.updateMany.mockRejectedValueOnce(new Error(NETWORK_LOST));
    const c = caller(prisma);

    await expect(c.invoice.create(october)).rejects.toThrow(NETWORK_LOST);
    expect(invoices).toEqual([]);
    for (const id of ["e1", "e2", "e3"]) expect(entries.find((e) => e.id === id)?.invoice_id).toBeNull();
    expect(logError).not.toHaveBeenCalledWith("invoice_undo_failed", expect.anything(), expect.anything());

    const retry = await c.invoice.create(october);
    expect(invoices.map((i) => ({ id: i.id, number: i.number }))).toEqual([{ id: retry.id, number: "2026-001" }]);
    expect(entries.find((e) => e.id === "e1")?.invoice_id).toBe(retry.id);
    expect(entries.find((e) => e.id === "e2")?.invoice_id).toBe(retry.id);
    expect(entries.find((e) => e.id === "e3")?.invoice_id).toBeNull(); // non-billable
  });

  it("a failure in a later group also frees the groups already marked", async () => {
    const { prisma, entries, invoices, entry } = memoryBillingDb();
    for (let i = 0; i < MARK_GROUP + 20; i++) {
      entries.push(entry(`m${i}`, "u1", "p1", `2026-10-${String((i % 28) + 1).padStart(2, "0")}`, 15, `task ${i}`));
    }
    const real = prisma.timeEntry.updateMany.getMockImplementation();
    if (!real) throw new Error("the store has no updateMany");
    prisma.timeEntry.updateMany.mockImplementationOnce(real).mockRejectedValueOnce(new Error(NETWORK_LOST));

    await expect(caller(prisma).invoice.create(october)).rejects.toThrow(NETWORK_LOST);
    expect(entries.filter((e) => e.user_id === "u1" && e.invoice_id !== null)).toEqual([]);
    expect(invoices).toEqual([]);
    expect(prisma.invoice.deleteMany).toHaveBeenCalledWith({ where: { id: "inv1", user_id: "u1" } });
  });

  it("billed again on purpose: time on an earlier invoice keeps it, only the new invoice is deleted", async () => {
    const { prisma, entries, invoices } = memoryBillingDb();
    invoices.push({
      id: "inv-old",
      user_id: "u1",
      number: "2025-009",
      client_id: "c1",
      period_from: "2026-10-01",
      period_to: "2026-10-02",
    });
    const e1 = entries.find((e) => e.id === "e1");
    if (!e1) throw new Error("e1 missing");
    e1.invoice_id = "inv-old";
    prisma.timeEntry.updateMany.mockRejectedValueOnce(new Error(NETWORK_LOST));

    await expect(caller(prisma).invoice.create({ ...october, includeInvoiced: true })).rejects.toThrow(NETWORK_LOST);
    expect(e1.invoice_id).toBe("inv-old");
    expect(entries.find((e) => e.id === "e2")?.invoice_id).toBeNull();
    expect(invoices.map((i) => i.id)).toEqual(["inv-old"]);
    expect(prisma.invoice.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.invoice.deleteMany).toHaveBeenCalledWith({ where: { id: "inv2", user_id: "u1" } });
  });

  it("if the undo fails too, the user still gets the first error and the half-saved invoice is logged by id", async () => {
    const { prisma } = memoryBillingDb();
    const markError = new Error(NETWORK_LOST);
    const undoError = new Error("D1_ERROR: still down");
    prisma.timeEntry.updateMany.mockRejectedValueOnce(markError);
    prisma.invoice.deleteMany.mockRejectedValueOnce(undoError);

    await expect(caller(prisma).invoice.create(october)).rejects.toThrow(NETWORK_LOST);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      "invoice_undo_failed",
      undoError,
      expect.objectContaining({ invoiceId: "inv1", userId: "u1" }),
    );
  });
});
