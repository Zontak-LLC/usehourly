import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { secondsUntilUtcMidnight } from "@/server/invoice-create-limit";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryBillingDb } from "./helpers/memory-billing";
import { memoryRateLimit } from "./helpers/memory-rate-limit";

/*
 * One account, or a script with an API token behind the MCP create_invoice tool, cannot make endless invoices or store
 * huge ones: invoice.create allows 50 a UTC day per account, and refuses an invoice whose stored copy is over 200,000
 * characters. Previews never count.
 */

const TOO_BIG = "That invoice has too much detail to store. Choose a shorter period, or turn off the time breakdown.";

const caller = (prisma: unknown, userId = "u1") =>
  createCallerFactory(appRouter)({ prisma, userId, session: { user: { id: userId }, expires: "" } } as never);

/** The date `i` days after 2025-01-01, away from the shared October 2026 rows. */
const dayOf = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);

/** The shared billing world plus a rate-limit table, with one billable u1 entry on p1 for each of `days` days. */
function worldWithDays(days: number) {
  const db = memoryBillingDb();
  const limits = memoryRateLimit();
  for (let i = 0; i < days; i++) db.entries.push(db.entry(`d${i}`, "u1", "p1", dayOf(i), 60, "work"));
  return { ...db, limits, prisma: { ...db.prisma, ...limits } };
}

/** Invoice number `i + 1` for day `i` only, so every invoice has its own unbilled time. */
const dayInvoice = (i: number) => ({
  clientId: "c1",
  from: dayOf(i),
  to: dayOf(i),
  number: `INV-${i + 1}`,
  issueDate: "2026-11-20",
});

async function makeInvoices(c: ReturnType<typeof caller>, count: number) {
  for (let i = 0; i < count; i++) await c.invoice.create(dayInvoice(i));
}

/** `count` entries with 2,000-character notes on p1, each on its own day of 2025. */
function worldWithLongNotes(count: number) {
  const world = worldWithDays(0);
  for (let i = 0; i < count; i++) {
    world.entries.push(world.entry(`n${i}`, "u1", "p1", dayOf(i), 30, `${i} ${"x".repeat(2000)}`));
  }
  return world;
}

const wholeYear = { clientId: "c1", from: "2025-01-01", to: "2025-12-31", number: "INV-BIG", issueDate: "2026-11-20" };

describe("the daily invoice limit", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("makes 50 invoices in a day, then refuses the 51st in plain words and saves nothing", async () => {
    const { prisma, entries } = worldWithDays(51);
    const c = caller(prisma);
    await makeInvoices(c, 50);
    expect(prisma.invoice.create).toHaveBeenCalledTimes(50);
    expect(prisma.invoice.create.mock.calls[49][0].data).toMatchObject({
      number: "INV-50",
      period_from: dayOf(49),
      period_to: dayOf(49),
    });

    const refused = c.invoice.create(dayInvoice(50));
    await expect(refused).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(refused).rejects.toThrow(/^You've made 50 invoices today\. Try again in about/);
    expect(prisma.invoice.create).toHaveBeenCalledTimes(50);
    expect(entries.find((e) => e.id === "d50")?.invoice_id).toBeNull();
  });

  it("says how long to wait, and allows invoices again just after midnight UTC", async () => {
    const { prisma } = worldWithDays(52);
    const c = caller(prisma);
    vi.setSystemTime(new Date("2026-11-20T23:50:00Z"));
    await makeInvoices(c, 50);

    vi.setSystemTime(new Date("2026-11-20T23:55:00Z"));
    await expect(c.invoice.create(dayInvoice(50))).rejects.toThrow(
      "You've made 50 invoices today. Try again in about 5 minutes.",
    );

    vi.setSystemTime(new Date("2026-11-21T00:00:01Z"));
    await c.invoice.create(dayInvoice(51));
    expect(prisma.invoice.create).toHaveBeenCalledTimes(51);
    expect(prisma.invoice.create.mock.calls[50][0].data).toMatchObject({ number: "INV-52" });
  });

  it("counts per account: another account can still make invoices", async () => {
    const { prisma, entries, entry } = worldWithDays(51);
    entries.push(entry("u2day", "u2", "p9", dayOf(0), 120, "theirs"));
    await makeInvoices(caller(prisma), 50);
    await expect(caller(prisma).invoice.create(dayInvoice(50))).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    await caller(prisma, "u2").invoice.create({ ...dayInvoice(0), clientId: "c9", number: "T-1" });
    expect(prisma.invoice.create).toHaveBeenCalledTimes(51);
    expect(prisma.invoice.create.mock.calls[50][0].data).toMatchObject({ user_id: "u2", client_id: "c9" });
    expect(entries.find((e) => e.id === "u2day")?.invoice_id).toBe("inv51");
  });

  it("never counts a preview", async () => {
    const { prisma, limits } = worldWithDays(1);
    const c = caller(prisma);
    for (let i = 0; i < 60; i++) {
      const { snapshot } = await c.invoice.preview(dayInvoice(0));
      expect(snapshot.totalMinutes).toBe(60);
    }
    expect(limits.rows.has("invcreate:u:u1")).toBe(false);
    expect(prisma.rateLimit.updateMany).not.toHaveBeenCalled();
  });
});

describe("the stored invoice size cap", () => {
  it("refuses an invoice of about 300,000 characters on Save and on Preview, and stores nothing", async () => {
    const { prisma } = worldWithLongNotes(150);
    const c = caller(prisma);
    await expect(c.invoice.create(wholeYear)).rejects.toMatchObject({ code: "BAD_REQUEST", message: TOO_BIG });
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    await expect(c.invoice.preview(wholeYear)).rejects.toMatchObject({ code: "BAD_REQUEST", message: TOO_BIG });
  });

  it("still saves an invoice of about 120,000 characters", async () => {
    const { prisma } = worldWithLongNotes(60);
    await caller(prisma).invoice.create(wholeYear);
    expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
    const stored = prisma.invoice.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(String(stored.snapshot).length).toBeGreaterThan(120_000);
    expect(String(stored.snapshot).length).toBeLessThan(200_000);
  });
});

describe("secondsUntilUtcMidnight", () => {
  const at = (iso: string) => secondsUntilUtcMidnight(Date.parse(iso) / 1000);

  it("counts down to the next 00:00 UTC, never below 1", () => {
    expect(at("2026-11-20T23:59:59Z")).toBe(1);
    expect(at("2026-11-20T00:00:00Z")).toBe(86_400);
    expect(at("2026-11-20T12:00:00Z")).toBe(43_200);
  });
});
