import { describe, expect, it } from "vitest";

import { ENTRY_GONE } from "@/lib/entry-gone";

import { sqliteWorld } from "./billed-world";

/** Deleting time that is on an invoice is refused, naming the invoice, so the invoice and the timesheet agree. */
const REFUSAL =
  "This entry is on invoice INV-2026-004, so it can't be deleted. Delete the invoice first to free its time.";

describe("deleting billed time", () => {
  it("refuses to delete an entry on an invoice, names the invoice, and keeps the row", async () => {
    const w = sqliteWorld();
    await expect(w.c.entry.delete({ id: "e2" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: REFUSAL });
    expect(await w.row()).toMatchObject({ minutes: 120, invoice_id: "inv1" });
  });

  it("deletes the entry once it is no longer on an invoice", async () => {
    const w = sqliteWorld();
    w.db.exec("UPDATE time_entries SET invoice_id = NULL WHERE id = 'e2'");
    expect(await w.c.entry.delete({ id: "e2" })).toEqual({ ok: true });
    expect(await w.prisma.timeEntry.count({ where: { id: "e2" } })).toBe(0);
  });

  it("answers NOT_FOUND for another user's entry (which stays) and for a missing id", async () => {
    const w = sqliteWorld();
    await expect(w.callerFor("u2").entry.delete({ id: "e2" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: ENTRY_GONE,
    });
    await expect(w.c.entry.delete({ id: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND", message: ENTRY_GONE });
    expect(await w.row()).toMatchObject({ minutes: 120, invoice_id: "inv1" });
  });

  it("works again after the invoice is deleted, which frees its time", async () => {
    const w = sqliteWorld();
    await w.c.invoice.delete({ id: "inv1" });
    expect(await w.row()).toMatchObject({ invoice_id: null });
    expect(await w.c.entry.delete({ id: "e2" })).toEqual({ ok: true });
    expect(await w.prisma.timeEntry.count({ where: { id: "e2" } })).toBe(0);
  });
});
