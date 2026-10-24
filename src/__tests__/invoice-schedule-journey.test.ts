import { describe, expect, it } from "vitest";

import { invoiceDraft, mailtoHref, reminderDraft } from "@/lib/invoice-draft";
import { daysLate } from "@/lib/invoice-mail";
import {
  duePeriod,
  dueTitle,
  invoiceBuilderHref,
  nextDueDate,
  periodInvoiced,
  periodName,
  scheduleHint,
  scheduleOf,
} from "@/lib/invoice-schedule";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryBillingDb } from "./helpers/memory-billing";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Get paid without chasing (issue 100): a client can be invoiced every month or every 2 weeks. When a period is over
 * and its time is not billed, Invoices and the client's bill bar say "October invoice for Acme is due" and open the
 * builder on that period; the prompt goes once an invoice covers it. An overdue invoice gets a polite reminder written
 * for the person's own mail app. Nothing is sent by UseHourly and nothing is stored as a draft.
 */

const caller = (prisma: unknown, userId = "u1") =>
  createCallerFactory(appRouter)({ prisma, userId, session: { user: { id: userId } } } as never);

describe("the schedule rules", () => {
  const month = { every: "month" as const, anchor: null };
  const twoWeeks = { every: "2weeks" as const, anchor: "2026-10-05" };

  it("every month: the previous calendar month is due on the 1st, across year ends and leap days", () => {
    expect(duePeriod(month, "2026-11-01")).toEqual({ from: "2026-10-01", to: "2026-10-31", due: "2026-11-01" });
    expect(duePeriod(month, "2026-11-30")).toEqual({ from: "2026-10-01", to: "2026-10-31", due: "2026-11-01" });
    expect(duePeriod(month, "2027-01-15")).toEqual({ from: "2026-12-01", to: "2026-12-31", due: "2027-01-01" });
    expect(duePeriod(month, "2028-03-01")).toEqual({ from: "2028-02-01", to: "2028-02-29", due: "2028-03-01" });
    expect(duePeriod(month, "2027-03-31")).toEqual({ from: "2027-02-01", to: "2027-02-28", due: "2027-03-01" });
    expect(nextDueDate(month, "2026-10-24")).toBe("2026-11-01");
    expect(nextDueDate(month, "2028-02-29")).toBe("2028-03-01");
    expect(nextDueDate(month, "2026-12-31")).toBe("2027-01-01");
  });

  it("every 2 weeks: nothing is due until the first 14 days are over, then the last full period", () => {
    expect(duePeriod(twoWeeks, "2026-10-01")).toBeNull(); // before the start
    expect(duePeriod(twoWeeks, "2026-10-18")).toBeNull(); // day 14 of the first period
    expect(duePeriod(twoWeeks, "2026-10-19")).toEqual({ from: "2026-10-05", to: "2026-10-18", due: "2026-10-19" });
    expect(duePeriod(twoWeeks, "2026-11-01")).toEqual({ from: "2026-10-05", to: "2026-10-18", due: "2026-10-19" });
    expect(duePeriod(twoWeeks, "2026-11-02")).toEqual({ from: "2026-10-19", to: "2026-11-01", due: "2026-11-02" });
    // Over a leap day: Feb 16, 2028 + 14 = Mar 1 (Feb has 29 days that year).
    expect(duePeriod({ every: "2weeks", anchor: "2028-02-16" }, "2028-03-01")).toEqual({
      from: "2028-02-16",
      to: "2028-02-29",
      due: "2028-03-01",
    });
    expect(nextDueDate(twoWeeks, "2026-10-01")).toBe("2026-10-19");
    expect(nextDueDate(twoWeeks, "2026-10-19")).toBe("2026-11-02");
    expect(nextDueDate(twoWeeks, "2026-10-24")).toBe("2026-11-02");
  });

  it("reads only sensible stored values, and names and links the period", () => {
    expect(scheduleOf({ invoice_every: null, invoice_anchor: null })).toBeNull();
    expect(scheduleOf({ invoice_every: "weekly", invoice_anchor: null })).toBeNull();
    expect(scheduleOf({ invoice_every: "2weeks", invoice_anchor: null })).toBeNull();
    expect(scheduleOf({ invoice_every: "2weeks", invoice_anchor: "2026-02-30" })).toBeNull();
    expect(scheduleOf({ invoice_every: "month", invoice_anchor: "2026-10-05" })).toEqual({
      every: "month",
      anchor: null,
    });
    expect(periodName({ from: "2026-10-01", to: "2026-10-31" }, "2026-11-01")).toBe("October");
    expect(periodName({ from: "2026-12-01", to: "2026-12-31" }, "2027-01-01")).toBe("December 2026");
    expect(periodName({ from: "2026-10-05", to: "2026-10-18" }, "2026-10-19")).toBe("Oct 5 – Oct 18");
    expect(dueTitle({ from: "2026-10-01", to: "2026-10-31" }, "2026-11-02", "Acme")).toBe(
      "October invoice for Acme is due",
    );
    expect(invoiceBuilderHref("c 1", { from: "2026-10-01", to: "2026-10-31" })).toBe(
      "/dashboard/invoices/new?client=c+1&from=2026-10-01&to=2026-10-31",
    );
    expect(scheduleHint(null, "2026-10-24")).toMatch(/whenever you like/);
    expect(scheduleHint(month, "2026-10-24")).toBe("On the 1st, for the month before. Next: Nov 1.");
  });

  it("an invoice covers the period only when it spans all of it", () => {
    const oct = { from: "2026-10-01", to: "2026-10-31" };
    expect(periodInvoiced(oct, [{ period_from: "2026-10-01", period_to: "2026-10-31" }])).toBe(true);
    expect(periodInvoiced(oct, [{ period_from: "2026-09-15", period_to: "2026-11-02" }])).toBe(true);
    expect(periodInvoiced(oct, [{ period_from: "2026-10-01", period_to: "2026-10-15" }])).toBe(false);
    expect(periodInvoiced(oct, [])).toBe(false);
  });
});

describe("setting a client's schedule", () => {
  it("the owner sets every month, then every 2 weeks with a start, then back to when I choose", async () => {
    const { prisma, clients } = memoryBillingDb();
    const c = caller(prisma);
    const base = { id: "c1", name: "Acme", legalName: "", address: "", logo: null };
    await c.clients.update({ ...base, schedule: { every: "month", anchor: "2026-10-05" } });
    expect(clients[0]).toMatchObject({ invoice_every: "month", invoice_anchor: null }); // no anchor for a month
    await c.clients.update({ ...base, schedule: { every: "2weeks", anchor: "2026-10-05" } });
    expect(clients[0]).toMatchObject({ invoice_every: "2weeks", invoice_anchor: "2026-10-05" });
    await c.clients.update(base); // left out = unchanged
    expect(clients[0]).toMatchObject({ invoice_every: "2weeks", invoice_anchor: "2026-10-05" });
    await c.clients.update({ ...base, schedule: { every: null, anchor: null } });
    expect(clients[0]).toMatchObject({ invoice_every: null, invoice_anchor: null });
  });

  it("another account's client cannot be scheduled", async () => {
    const { prisma, clients } = memoryBillingDb();
    await expect(
      caller(prisma, "u2").clients.update({
        id: "c1",
        name: "Acme",
        legalName: "",
        address: "",
        logo: null,
        schedule: { every: "month", anchor: null },
      }),
    ).rejects.toThrow(/Client not found/);
    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(clients[0].invoice_every).toBeNull();
  });

  it("refuses a schedule that makes no sense, before touching the database", async () => {
    const { prisma } = memoryBillingDb();
    const c = caller(prisma);
    const base = { id: "c1", name: "Acme", legalName: "", address: "", logo: null };
    await expect(c.clients.update({ ...base, schedule: { every: "2weeks", anchor: null } })).rejects.toThrow(
      /first day of the first two weeks/,
    );
    await expect(c.clients.update({ ...base, schedule: { every: "2weeks", anchor: "2026-02-30" } })).rejects.toThrow(
      /not a real date/,
    );
    await expect(c.clients.update({ ...base, schedule: { every: "weekly", anchor: null } } as never)).rejects.toThrow();
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
    expect(prisma.client.update).not.toHaveBeenCalled();
  });
});

describe("the invoice-due prompt", () => {
  /** Acme on a monthly schedule with September time (e10, e11) and October time (e1, e2 from the shared data). */
  function septemberDue() {
    const db = memoryBillingDb();
    db.clients[0].invoice_every = "month";
    db.entries.push(
      db.entry("e10", "u1", "p1", "2026-09-10", 120, "design"),
      db.entry("e11", "u1", "p1", "2026-09-29", 30, "call"),
    );
    return db;
  }

  it("is due for last month's unbilled time, and goes away once that month is invoiced", async () => {
    const { prisma, entries } = septemberDue();
    const c = caller(prisma);
    const [acme] = await c.invoice.unbilled({ today: "2026-10-24" });
    expect(acme).toMatchObject({ clientId: "c1", minutes: 270, cents: 45000 }); // all unbilled time, as before
    expect(acme.due).toEqual({ from: "2026-09-01", to: "2026-09-30", minutes: 150, cents: 25000 }); // September only

    // Make invoice from the prompt: the builder bills that exact period.
    await c.invoice.create({
      clientId: "c1",
      from: "2026-09-01",
      to: "2026-09-30",
      number: "INV-2026-001",
      issueDate: "2026-10-24",
      dueDate: "2026-11-23",
    });
    expect((await c.invoice.unbilled({ today: "2026-10-24" }))[0].due).toBeNull();

    // A September entry logged after the invoice was made does not bring the prompt back: an invoice covers September.
    entries.push({ ...entries[0], id: "late", date: "2026-09-30", invoice_id: null });
    const [after] = await c.invoice.unbilled({ today: "2026-10-24" });
    expect(after.minutes).toBeGreaterThan(0);
    expect(after.due).toBeNull();
  });

  it("counts only the time not billed yet when an invoice covers part of the period", async () => {
    const { prisma } = septemberDue();
    const c = caller(prisma);
    await c.invoice.create({
      clientId: "c1",
      from: "2026-09-01",
      to: "2026-09-15",
      number: "INV-2026-001",
      issueDate: "2026-09-16",
    });
    // e10 (Sep 10) is on that invoice; e11 (Sep 29, 30 min) is still waiting, so September is still due.
    expect((await c.invoice.unbilled({ today: "2026-10-24" }))[0].due).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
      minutes: 30,
      cents: 5000,
    });
  });

  it("goes away when an invoice made by hand already covers the period", async () => {
    const { prisma, invoices } = septemberDue();
    invoices.push({
      id: "old",
      user_id: "u1",
      number: "INV-2026-000",
      client_id: "c1",
      period_from: "2026-08-15",
      period_to: "2026-09-30",
    });
    expect((await caller(prisma).invoice.unbilled({ today: "2026-10-24" }))[0].due).toBeNull();
  });

  it("is only worked out with the browser's today, and never for a client without a schedule", async () => {
    const { prisma, clients } = septemberDue();
    const c = caller(prisma);
    expect((await c.invoice.unbilled())[0].due).toBeUndefined(); // no today: the server never guesses it
    clients[0].invoice_every = null;
    expect((await c.invoice.unbilled({ today: "2026-10-24" }))[0].due).toBeNull();
    await expect(c.invoice.unbilled({ today: "2026-13-01" })).rejects.toThrow(/not a real date/);
  });

  it("leaves out days marked non-billable and non-billable projects", async () => {
    const { prisma, entries, nonBillableRows } = septemberDue();
    nonBillableRows.push({ user_id: "u1", date: "2026-09-29" }); // e11 (30 min)
    entries.push({ ...entries[2], id: "admin", date: "2026-09-12" }); // the non-billable Admin project
    const [acme] = await caller(prisma).invoice.unbilled({ today: "2026-10-24" });
    expect(acme.due).toMatchObject({ minutes: 120, cents: 20000 });
  });

  it("never counts another account's time or invoices", async () => {
    const { prisma, clients, entries } = septemberDue();
    clients[1].invoice_every = "month";
    entries.push({ ...entries[3], id: "theirs-sept", date: "2026-09-05" });
    const [theirs] = await caller(prisma, "u2").invoice.unbilled({ today: "2026-10-24" });
    expect(theirs.due).toEqual({ from: "2026-09-01", to: "2026-09-30", minutes: 600, cents: 99000 });
    for (const call of prisma.invoice.findMany.mock.calls) expect(call[0].where.user_id).toBe("u2");
    for (const call of prisma.timeEntry.findMany.mock.calls) expect(call[0].where.user_id).toBe("u2");
  });
});

describe("the overdue reminder", () => {
  const invoice = {
    number: "INV-2026-004",
    sellerName: "Jo LLC",
    totalCents: 118750,
    currency: "EUR",
    periodFrom: "2026-09-01",
    periodTo: "2026-09-30",
    issueDate: "2026-10-01",
    dueDate: "2026-10-15",
    paidDate: null,
    link: "https://usehourly.app/invoice/abc",
  };

  it("is late only when unpaid and past its due date", () => {
    expect(daysLate({ due_date: "2026-10-15", paid_date: null }, "2026-10-24")).toBe(9);
    expect(daysLate({ due_date: "2026-10-15", paid_date: null }, "2026-10-15")).toBeNull();
    expect(daysLate({ due_date: "2026-10-15", paid_date: "2026-10-20" }, "2026-10-24")).toBeNull();
    expect(daysLate({ due_date: null, paid_date: null }, "2026-10-24")).toBeNull();
  });

  it("says the amount in the invoice's currency, how late it is, the link and who it is from", () => {
    const d = reminderDraft({ ...invoice, daysLate: 9 });
    expect(d.subject).toBe("Reminder: Invoice INV-2026-004 from Jo LLC is overdue");
    expect(d.body).toContain("€1,187.50");
    expect(d.body).toContain("was due on Oct 15, 2026, 9 days ago");
    expect(d.body).toContain("https://usehourly.app/invoice/abc");
    expect(d.body.trim().split("\n").at(-1)).toBe("Jo LLC");
    expect(reminderDraft({ ...invoice, daysLate: 1 }).body).toContain("1 day ago");
    // Without a link the PDF is attached by hand, as in the invoice email.
    expect(reminderDraft({ ...invoice, link: null, daysLate: 9 }).body).toContain("attached as a PDF");
    // The invoice email itself is unchanged by the shared parts.
    expect(invoiceDraft(invoice).body).toContain("Here is invoice INV-2026-004 for €1,187.50");
  });

  it("opens the mail app with exactly that text, and a typed ? or & cannot add a header", () => {
    const d = reminderDraft({ ...invoice, sellerName: "Jo & Co?bcc=evil@x.com", daysLate: 9 });
    const href = mailtoHref("ap@acme.com", d.subject, d.body);
    const url = new URL(href);
    expect(url.pathname).toBe("ap@acme.com");
    expect([...url.searchParams.keys()]).toEqual(["subject", "body"]); // no Bcc smuggled in
    expect(url.searchParams.get("subject")).toBe(d.subject);
    expect(url.searchParams.get("body")).toBe(d.body.replace(/\n/g, "\r\n")); // CRLF line breaks
    expect(href).not.toMatch(/[ \n]/);
  });
});

describe("migration 0039 on a real database", () => {
  it("adds the two nullable columns, so existing clients stay 'when I choose'", () => {
    const db = new DatabaseSync(":memory:");
    const dir = path.join(process.cwd(), "migrations");
    const files = readdirSync(dir)
      .filter((n) => n.endsWith(".sql"))
      .sort();
    for (const f of files.filter((n) => n < "0039")) db.exec(readFileSync(path.join(dir, f), "utf8"));
    db.exec(`INSERT INTO auth_users (id, email, password_hash) VALUES ('u1', 'jo@example.com', 'x')`);
    db.exec(`INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u1', 'Acme')`);
    for (const f of files.filter((n) => n >= "0039")) db.exec(readFileSync(path.join(dir, f), "utf8"));
    expect(db.prepare("SELECT invoice_every, invoice_anchor FROM clients WHERE id = 'c1'").get()).toEqual({
      invoice_every: null,
      invoice_anchor: null,
    });
    db.exec(`UPDATE clients SET invoice_every = '2weeks', invoice_anchor = '2026-10-05' WHERE id = 'c1'`);
    expect(db.prepare("SELECT invoice_every FROM clients WHERE id = 'c1'").get()).toEqual({ invoice_every: "2weeks" });
  });
});
