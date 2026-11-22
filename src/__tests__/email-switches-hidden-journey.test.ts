import { describe, expect, it, vi } from "vitest";

import { feature } from "@/lib/features";
import type { MailMessage } from "@/lib/mailer";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryNonBillableDays } from "./helpers/memory-non-billable";
import { memoryRateLimit } from "./helpers/memory-rate-limit";

/**
 * Emailing invoices, "Email me this" on the Year summary and the Friday reminder are hidden in this release (real
 * switches, no mock). Nobody can send one of these emails or switch one on by calling the server directly: the server
 * refuses as not found before it reads or sends anything. The Year summary itself stays open.
 */

const createCaller = createCallerFactory(appRouter);
const REFUSED = { code: "NOT_FOUND", message: "Not found." };

function world() {
  const invoice = { id: "inv1", user_id: "u1", due_date: "2026-10-10", remind_overdue: false };
  const account = { id: "u1", email: "jo@example.com", currency: "USD", weekly_reminder: false };
  const limiter = memoryRateLimit();
  const prisma = {
    ...memoryNonBillableDays(),
    rateLimit: limiter.rateLimit,
    invoice: {
      findFirst: vi.fn(async () => invoice),
      findMany: vi.fn(async () => [
        {
          number: "I-1",
          client_name: "Acme",
          issue_date: "2026-03-31",
          paid_date: null,
          total_cents: 10_000,
          total_minutes: 60,
          currency: "USD",
        },
      ]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    invoiceEmail: { create: vi.fn(async () => ({})) },
    timeEntry: { findMany: vi.fn(async () => [{ date: "2026-03-02", minutes: 60, project_id: "p1" }]) },
    project: {
      findMany: vi.fn(async () => [
        {
          id: "p1",
          name: "Site",
          hourly_rate: 10_000,
          billable: true,
          client: { id: "c1", name: "Acme", currency: null },
        },
      ]),
    },
    authUser: { findUnique: vi.fn(async () => account), update: vi.fn(async () => account) },
  };
  const mailer = { send: vi.fn(async (_m: MailMessage) => undefined) };
  const as = (id: string | null) =>
    createCaller({
      session: id ? { user: { id }, expires: "" } : null,
      prisma: prisma as never,
      mailer,
      baseUrl: "https://app.test",
    } as never);
  return { prisma, mailer, invoice, account, rateLimitRows: limiter.rows, as };
}

describe("while the three emails are hidden", () => {
  it("runs with the release's real switches", () => {
    expect(feature("invoiceEmail")).toBe(false);
    expect(feature("reportEmail")).toBe(false);
    expect(feature("weeklyReminder")).toBe(false);
  });

  it("refuses to email an invoice, as not found, and reads, writes and sends nothing", async () => {
    const w = world();
    await expect(w.as("u1").invoiceMail.send({ invoiceId: "inv1" })).rejects.toMatchObject(REFUSED);
    expect(w.mailer.send).not.toHaveBeenCalled();
    expect(w.prisma.invoice.findFirst).not.toHaveBeenCalled();
    expect(w.prisma.invoice.updateMany).not.toHaveBeenCalled();
    expect(w.prisma.invoiceEmail.create).not.toHaveBeenCalled();
  });

  it("refuses to switch on overdue reminders for an invoice, and the invoice keeps its setting", async () => {
    const w = world();
    await expect(w.as("u1").invoiceMail.setReminders({ invoiceId: "inv1", enabled: true })).rejects.toMatchObject(
      REFUSED,
    );
    expect(w.prisma.invoice.updateMany).not.toHaveBeenCalled();
    expect(w.invoice.remind_overdue).toBe(false);
  });

  it("refuses to email the year summary, before it looks up the account or counts the day's sends", async () => {
    const w = world();
    await expect(w.as("u1").report.email({ year: 2026 })).rejects.toMatchObject(REFUSED);
    expect(w.mailer.send).not.toHaveBeenCalled();
    expect(w.prisma.authUser.findUnique).not.toHaveBeenCalled();
    expect(w.rateLimitRows.has("reportmail:u:u1")).toBe(false);
    expect(w.rateLimitRows.size).toBe(0);
  });

  it("still shows the year summary itself", async () => {
    const w = world();
    const report = await w.as("u1").report.annual({ year: 2026 });
    expect(report.year).toBe(2026);
    expect(report.currency).toBe("USD");
    expect(report.totals.minutes).toBe(60);
    expect(report.invoices.count).toBe(1);
    expect(w.mailer.send).not.toHaveBeenCalled();
  });

  it("refuses to switch on the Friday reminder, and the account stays off", async () => {
    const w = world();
    await expect(
      w.as("u1").account.setWeeklyReminder({ enabled: true, timezone: "Europe/London" }),
    ).rejects.toMatchObject(REFUSED);
    expect(w.prisma.authUser.update).not.toHaveBeenCalled();
    expect(w.account.weekly_reminder).toBe(false);
  });

  it("still asks a signed-out caller to sign in first", async () => {
    const w = world();
    const out = w.as(null);
    await expect(out.invoiceMail.send({ invoiceId: "inv1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(out.report.email({ year: 2026 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(out.account.setWeeklyReminder({ enabled: true, timezone: "Europe/London" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(w.mailer.send).not.toHaveBeenCalled();
    expect(w.prisma.authUser.update).not.toHaveBeenCalled();
  });
});
