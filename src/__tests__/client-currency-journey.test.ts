import { describe, expect, it, vi } from "vitest";

import { effectiveCurrency, totalsByCurrency } from "@/lib/money";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryNonBillableDays } from "./helpers/memory-non-billable";

const createCaller = createCallerFactory(appRouter);

/**
 * Issue #71 step 2: a client can be billed in its own currency. A client without one uses the account's. Its invoices
 * freeze that currency, it cannot change once the client has an invoice, and amounts in two currencies are never added.
 */

type ClientRow = { id: string; user_id: string; name: string; currency: string | null };

function world(opts: { account?: string; clients: ClientRow[]; invoicesFor?: string[] }) {
  const clients = opts.clients.map((c) => ({ legal_name: null, address: null, logo: null, ...c }));
  const created: { data: Record<string, unknown> }[] = [];
  const prisma = {
    ...memoryNonBillableDays(),
    client: {
      findFirst: vi.fn(
        async (a: { where: { id?: string; user_id: string } }) =>
          clients.find((c) => c.id === a.where.id && c.user_id === a.where.user_id) ?? null,
      ),
      update: vi.fn(async (a: { where: { id: string }; data: { currency?: string | null } }) => {
        const c = clients.find((x) => x.id === a.where.id);
        if (c && a.data.currency !== undefined) c.currency = a.data.currency;
        return { id: a.where.id };
      }),
    },
    authUser: {
      findUnique: vi.fn(async () => ({
        id: "u1",
        name: "Jo",
        email: "jo@example.com",
        currency: opts.account ?? "USD",
        business_name: "Jo LLC",
        ein: null,
        address: null,
        logo: null,
        payment_instructions: null,
        invoice_branding: true,
      })),
    },
    invoice: {
      count: vi.fn(async (a: { where: { client_id?: string } }) =>
        a.where.client_id ? (opts.invoicesFor ?? []).filter((id) => id === a.where.client_id).length : 0,
      ),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => {
        created.push(a);
        return { id: "inv1" };
      }),
    },
    timeEntry: {
      // Marks the entries an invoice bills (migration 0035); answers how many it marked.
      updateMany: vi.fn(async (a?: { where?: { id?: { in?: unknown[] } } }) => ({
        count: a?.where?.id?.in?.length ?? 0,
      })),
      findMany: vi.fn(async () => [
        {
          date: "2026-10-02",
          minutes: 60,
          note: "work",
          started_at: null,
          project_id: "p1",
          project: { name: "Website", hourly_rate: 10000, billable: true },
        },
      ]),
    },
  };
  const caller = createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });
  return { prisma, caller, clients, created };
}

const invoiceInput = (clientId: string) => ({
  clientId,
  from: "2026-10-01",
  to: "2026-10-31",
  number: "INV-1",
  issueDate: "2026-11-01",
});

describe("which currency a client is billed in", () => {
  it("is its own when it has one, else the account's", () => {
    expect(effectiveCurrency("EUR", "USD")).toBe("EUR");
    expect(effectiveCurrency(null, "GBP")).toBe("GBP");
    expect(effectiveCurrency(undefined, undefined)).toBe("USD");
    expect(effectiveCurrency("JPY", "CAD")).toBe("CAD"); // not offered: falls back to the account's
  });

  it("is saved on the client, cleared with null, and left alone when the form does not send it", async () => {
    const w = world({ clients: [{ id: "c1", user_id: "u1", name: "Acme", currency: null }] });
    const base = { id: "c1", name: "Acme", legalName: "", address: "", logo: null };
    await w.caller.clients.update({ ...base, currency: "EUR" });
    expect(w.clients[0].currency).toBe("EUR");
    await w.caller.clients.update(base);
    expect(w.clients[0].currency).toBe("EUR"); // not sent = unchanged
    await w.caller.clients.update({ ...base, currency: null });
    expect(w.clients[0].currency).toBeNull(); // back to the account's
  });

  it("only accepts an offered currency, and only for the caller's own client", async () => {
    const w = world({ clients: [{ id: "c2", user_id: "someone-else", name: "Other", currency: null }] });
    const base = { id: "c2", name: "Other", legalName: "", address: "", logo: null };
    await expect(w.caller.clients.update({ ...base, currency: "EUR" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(w.caller.clients.update({ ...base, currency: "JPY" as never })).rejects.toThrow();
    expect(w.prisma.client.update).not.toHaveBeenCalled();
  });
});

describe("a client's currency is fixed once it has an invoice", () => {
  const rows = [{ id: "c1", user_id: "u1", name: "Acme", currency: "EUR" }];
  const base = { id: "c1", name: "Acme", legalName: "", address: "", logo: null };

  it("refuses a change with a plain reason and writes nothing", async () => {
    const w = world({ clients: rows.map((r) => ({ ...r })), invoicesFor: ["c1"] });
    await expect(w.caller.clients.update({ ...base, currency: "GBP" })).rejects.toThrow(
      /fixed once you have made an invoice/,
    );
    await expect(w.caller.clients.update({ ...base, currency: null })).rejects.toThrow(/fixed once/); // USD account
    expect(w.prisma.client.update).not.toHaveBeenCalled();
    expect(w.clients[0].currency).toBe("EUR");
  });

  it("allows saving the same effective currency again (the form sends it on every save)", async () => {
    const w = world({ clients: rows.map((r) => ({ ...r })), invoicesFor: ["c1"] });
    await w.caller.clients.update({ ...base, currency: "EUR" });
    expect(w.prisma.client.update).toHaveBeenCalledTimes(1);
    // a client on the account's currency may also "choose" that same currency
    const w2 = world({
      account: "EUR",
      clients: [{ id: "c1", user_id: "u1", name: "Acme", currency: null }],
      invoicesFor: ["c1"],
    });
    await w2.caller.clients.update({ ...base, currency: "EUR" });
    expect(w2.prisma.client.update).toHaveBeenCalledTimes(1);
  });

  it("only counts that client's invoices: another client of the account can still change", async () => {
    const w = world({
      clients: [{ id: "c1", user_id: "u1", name: "Acme", currency: "EUR" }],
      invoicesFor: ["some-other-client"],
    });
    await w.caller.clients.update({ ...base, currency: "GBP" });
    expect(w.clients[0].currency).toBe("GBP");
  });
});

describe("an invoice is made in the client's currency", () => {
  it("freezes the client's own currency in the snapshot and on the invoice row", async () => {
    const w = world({ account: "USD", clients: [{ id: "c1", user_id: "u1", name: "Acme", currency: "EUR" }] });
    const r = await w.caller.invoice.create(invoiceInput("c1"));
    expect(r.snapshot.currency).toBe("EUR");
    expect(w.created[0].data).toMatchObject({ currency: "EUR", total_cents: 10000 });
    expect(JSON.parse(String(w.created[0].data.snapshot)).currency).toBe("EUR");
  });

  it("uses the account's currency for a client that has none of its own", async () => {
    const w = world({ account: "GBP", clients: [{ id: "c1", user_id: "u1", name: "Acme", currency: null }] });
    const r = await w.caller.invoice.create(invoiceInput("c1"));
    expect(r.snapshot.currency).toBe("GBP");
    expect(w.created[0].data).toMatchObject({ currency: "GBP" });
  });
});

describe("invoice totals never add two currencies", () => {
  it("gives one set of figures per currency, in order of first appearance", () => {
    const groups = totalsByCurrency([
      { currency: "USD", total_cents: 10000, paid_date: null },
      { currency: "EUR", total_cents: 5000, paid_date: "2026-11-02" },
      { currency: "USD", total_cents: 2500, paid_date: "2026-11-03" },
      { currency: "EUR", total_cents: 700, paid_date: null },
    ]);
    expect(groups).toEqual([
      { currency: "USD", count: 2, total: 12500, unpaid: 10000 },
      { currency: "EUR", count: 2, total: 5700, unpaid: 700 },
    ]);
    expect(totalsByCurrency([])).toEqual([]);
    expect(totalsByCurrency([{ currency: "weird", total_cents: 100, paid_date: null }])[0].currency).toBe("USD");
  });
});

describe("the year summary shows one currency at a time", () => {
  function reportWorld(account = "USD") {
    const projects = [
      {
        id: "p1",
        name: "Site",
        hourly_rate: 10000,
        billable: true,
        client: { id: "c1", name: "Acme", currency: null },
      },
      {
        id: "p2",
        name: "Shop",
        hourly_rate: 8000,
        billable: true,
        client: { id: "c2", name: "Fern", currency: "EUR" },
      },
    ];
    const entries = [
      { date: "2026-03-02", minutes: 60, project_id: "p1" },
      { date: "2026-03-03", minutes: 120, project_id: "p2" },
    ];
    const invoices = [
      {
        number: "I-1",
        client_name: "Acme",
        issue_date: "2026-03-31",
        paid_date: null,
        total_cents: 10000,
        total_minutes: 60,
        currency: "USD",
      },
      {
        number: "I-2",
        client_name: "Fern",
        issue_date: "2026-03-31",
        paid_date: "2026-04-05",
        total_cents: 16000,
        total_minutes: 120,
        currency: "EUR",
      },
    ];
    const prisma = {
      ...memoryNonBillableDays(),
      timeEntry: { findMany: vi.fn(async () => entries) },
      project: { findMany: vi.fn(async () => projects) },
      invoice: { findMany: vi.fn(async () => invoices) },
      authUser: { findUnique: vi.fn(async () => ({ currency: account })) },
    };
    return createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });
  }

  it("defaults to the account's currency and lists the others", async () => {
    const r = await reportWorld().report.annual({ year: 2026 });
    expect(r.currency).toBe("USD");
    expect(r.currencies).toEqual(["USD", "EUR"]);
    expect(r.totals.earnedCents).toBe(10000); // only Acme's hour: never 10000 + 16000
    expect(r.projects.map((p) => p.project)).toEqual(["Site"]);
    expect(r.invoices.totalCents).toBe(10000);
    expect(r.received.count).toBe(0);
  });

  it("shows the other currency when it is picked, and none of the first", async () => {
    const r = await reportWorld().report.annual({ year: 2026, currency: "EUR" });
    expect(r.currency).toBe("EUR");
    expect(r.totals.earnedCents).toBe(16000);
    expect(r.projects.map((p) => p.project)).toEqual(["Shop"]);
    expect(r.invoices.totalCents).toBe(16000);
    expect(r.received.totalCents).toBe(16000);
  });
});

describe("the accounting export writes one currency per file", () => {
  it("filters invoices by the chosen currency and lists the currencies in use", async () => {
    const rows = [
      { number: "I-1", currency: "USD" },
      { number: "I-2", currency: "EUR" },
    ];
    const findMany = vi.fn(async (a: { where: { currency?: string } }) =>
      rows
        .filter((r) => !a.where.currency || r.currency === a.where.currency)
        .map((r) => ({
          number: r.number,
          issue_date: "2026-03-31",
          due_date: null,
          paid_date: null,
          total_cents: 10000,
          client_id: null,
          snapshot: JSON.stringify({
            periodFrom: "2026-03-01",
            periodTo: "2026-03-31",
            notes: "",
            client: { name: "X" },
            lines: [],
          }),
        })),
    );
    const prisma = {
      invoice: { findMany, groupBy: vi.fn(async () => [{ currency: "USD" }, { currency: "EUR" }]) },
    };
    const caller = createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });
    expect(await caller.accounting.currencies()).toEqual(["EUR", "USD"]);
    const eur = await caller.accounting.invoices({ from: "2026-01-01", to: "2026-12-31", currency: "EUR" });
    expect(eur.invoices.map((i) => i.number)).toEqual(["I-2"]);
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ user_id: "u1", currency: "EUR" }) }),
    );
  });
});
