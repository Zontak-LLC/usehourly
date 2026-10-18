import { describe, expect, it, vi } from "vitest";

import { buildInvoice, buildSearchText, type InvoiceSnapshot } from "@/lib/invoice";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryInvoiceLogos } from "./helpers/memory-invoice-logos";

const createCaller = createCallerFactory(appRouter);

const user = {
  id: "u1",
  name: "Jo Freelance",
  email: "jo@example.com",
  business_name: "Jo Design LLC",
  ein: "12-3456789",
  address: "1 Main St\nSpringfield, IL 62701",
  logo: null,
  payment_instructions: "Pay by ACH\nRouting 000000000\nAccount 111122223333",
};

function mockPrisma() {
  return {
    ...memoryInvoiceLogos(),
    client: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => ({
        id: "c1",
        name: "Acme",
        legal_name: "Acme Holdings, Inc.",
        address: "500 Market St\nSan Francisco, CA",
        logo: null,
      })),
      update: vi.fn(async () => ({ id: "c1" })),
    },
    timeEntry: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => [
        {
          date: "2026-10-02",
          minutes: 90,
          note: "homepage hero",
          started_at: null,
          project_id: "p1",
          project: { name: "Website", hourly_rate: 10000, billable: true },
        },
        {
          date: "2026-10-03",
          minutes: 45,
          note: "nav fixes",
          started_at: null,
          project_id: "p1",
          project: { name: "Website", hourly_rate: 10000, billable: true },
        },
        {
          date: "2026-10-03",
          minutes: 60,
          note: "internal sync",
          started_at: null,
          project_id: "p2",
          project: { name: "Admin", hourly_rate: 5000, billable: false },
        },
      ]),
    },
    invoice: {
      findFirst: vi.fn(async () => null),
      update: vi.fn(async () => ({ id: "inv0" })),
      findMany: vi.fn(async () => []),
      create: vi.fn(async (_args: { data: Record<string, string> }) => ({ id: "inv1" })),
      count: vi.fn(async () => 2),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    authUser: { findUnique: vi.fn(async () => user), update: vi.fn(async () => ({ id: "u1" })) },
  };
}
type P = ReturnType<typeof mockPrisma>;
const asCaller = (prisma: P, userId: string | null) =>
  createCaller({
    session: userId ? { user: { id: userId }, expires: "" } : null,
    prisma: prisma as never,
  });

const input = {
  clientId: "c1",
  from: "2026-10-01",
  to: "2026-10-31",
  number: "INV-2026-003",
  issueDate: "2026-10-31",
  dueDate: "2026-11-30",
  notes: "Thanks!",
  includeDetail: true,
};

describe("client invoice journey", () => {
  it("bills 2h15 at $100/h = $225, skips non-billable time, and snapshots the seller's details", async () => {
    const prisma = mockPrisma();
    const { snapshot } = await asCaller(prisma, "u1").invoice.create(input);

    expect(prisma.client.findFirst).toHaveBeenCalledWith({ where: { id: "c1", user_id: "u1" } });
    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: "u1", date: { gte: "2026-10-01", lte: "2026-10-31" }, project: { client_id: "c1" } },
      }),
    );
    expect(snapshot.lines).toEqual([
      { projectId: "p1", project: "Website", minutes: 135, rateCents: 10000, amountCents: 22500 },
    ]);
    expect(snapshot.totalCents).toBe(22500);
    expect(snapshot.seller).toMatchObject({ name: "Jo Design LLC", ein: "12-3456789", email: "jo@example.com" });
    // how to pay is frozen onto the invoice with the rest of the seller's details
    expect(snapshot.seller.paymentInstructions).toBe("Pay by ACH\nRouting 000000000\nAccount 111122223333");
    expect(snapshot.detail.map((d) => d.note)).toEqual(["homepage hero", "nav fixes"]); // no "internal sync"

    const data = prisma.invoice.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      user_id: "u1",
      client_id: "c1",
      client_name: "Acme",
      number: "INV-2026-003",
      total_cents: 22500,
      total_minutes: 135,
      due_date: "2026-11-30",
    });
    expect(JSON.parse(data.snapshot).totalCents).toBe(22500);
    expect(data.search_text).toContain("homepage hero");
    expect(data.search_text).toContain("acme");
  });

  it("rejects a reused number, a foreign client, an empty period, and signed-out callers — writing nothing", async () => {
    const prisma = mockPrisma();
    const c = asCaller(prisma, "u1");

    prisma.invoice.findFirst.mockResolvedValueOnce({ id: "old" } as never);
    await expect(c.invoice.create(input)).rejects.toMatchObject({ code: "CONFLICT" });

    prisma.client.findFirst.mockResolvedValueOnce(null as never);
    await expect(c.invoice.create(input)).rejects.toMatchObject({ code: "NOT_FOUND" });

    prisma.timeEntry.findMany.mockResolvedValueOnce([]);
    await expect(c.invoice.create(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(c.invoice.create({ ...input, from: "2026-11-01", to: "2026-10-01" })).rejects.toThrow();
    await expect(asCaller(prisma, null).invoice.create(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it("history search is scoped to the user and matches lowercased text", async () => {
    const prisma = mockPrisma();
    await asCaller(prisma, "u1").invoice.list({ q: "  Homepage HERO ", clientId: "c1" });
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: "u1", client_id: "c1", search_text: { contains: "homepage hero" } },
      }),
    );
    await expect(asCaller(prisma, null).invoice.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("backfills a pre-billing-details invoice from the client once, then keeps it frozen", async () => {
    const prisma = mockPrisma();
    const legacy = {
      id: "inv0",
      user_id: "u1",
      client_id: "c1",
      snapshot: JSON.stringify({
        seller: { name: "Jo", ein: null, address: null, email: "jo@example.com", logo: null },
        client: { name: "Acme" }, // issued before legalName/address/logo existed
        number: "INV-1",
        lines: [],
        detail: [],
        notes: "",
        totalCents: 0,
        totalMinutes: 0,
      }),
    };
    prisma.invoice.findFirst.mockResolvedValueOnce(legacy as never);
    const r = await asCaller(prisma, "u1").invoice.get({ id: "inv0" });
    expect(r.snapshot.client).toMatchObject({
      name: "Acme",
      legalName: "Acme Holdings, Inc.",
      address: "500 Market St\nSan Francisco, CA",
    });
    expect(prisma.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv0" } }));

    // An invoice that already carries (even empty) details is never rewritten.
    prisma.invoice.update.mockClear();
    prisma.invoice.findFirst.mockResolvedValueOnce({
      ...legacy,
      snapshot: JSON.stringify({
        ...JSON.parse(legacy.snapshot),
        seller: { ...JSON.parse(legacy.snapshot).seller, paymentInstructions: null },
        client: { name: "Acme", legalName: null, address: null, logo: null },
      }),
    } as never);
    const frozen = await asCaller(prisma, "u1").invoice.get({ id: "inv0" });
    expect(frozen.snapshot.client.address).toBeNull();
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it("fills 'how to pay' into an older invoice once, from the account, then keeps it frozen", async () => {
    const prisma = mockPrisma();
    const old = {
      id: "inv0",
      user_id: "u1",
      client_id: "c1",
      snapshot: JSON.stringify({
        seller: { name: "Jo", ein: null, address: null, email: "jo@example.com", logo: null },
        client: { name: "Acme", legalName: null, address: null, logo: null },
        number: "INV-1",
        lines: [],
        detail: [],
        notes: "",
        totalCents: 0,
        totalMinutes: 0,
      }),
    };
    prisma.invoice.findFirst.mockResolvedValueOnce(old as never);
    const r = await asCaller(prisma, "u1").invoice.get({ id: "inv0" });
    expect(r.snapshot.seller.paymentInstructions).toBe("Pay by ACH\nRouting 000000000\nAccount 111122223333");
    expect(prisma.invoice.update).toHaveBeenCalledTimes(1);
    expect(prisma.authUser.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u1" } }));
  });

  it("finds invoices by issue-date range and sorts by amount, always within the caller's own", async () => {
    const prisma = mockPrisma();
    const c = asCaller(prisma, "u1");
    await c.invoice.list({ from: "2026-09-01", to: "2026-10-31", sort: "highest" });
    expect(prisma.invoice.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { user_id: "u1", issue_date: { gte: "2026-09-01", lte: "2026-10-31" } },
        orderBy: [{ total_cents: "desc" }, { issue_date: "desc" }],
      }),
    );
    await c.invoice.list({ from: "2026-09-01", sort: "oldest" });
    expect(prisma.invoice.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { user_id: "u1", issue_date: { gte: "2026-09-01" } },
        orderBy: [{ issue_date: "asc" }, { created_at: "asc" }],
      }),
    );
    // a malformed date is refused and nothing is queried
    prisma.invoice.findMany.mockClear();
    await expect(c.invoice.list({ from: "October" })).rejects.toThrow();
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it("only ever reads/deletes invoices owned by the caller", async () => {
    const prisma = mockPrisma();
    await expect(asCaller(prisma, "u1").invoice.get({ id: "other" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith({ where: { id: "other", user_id: "u1" } });
    await asCaller(prisma, "u1").invoice.delete({ id: "inv1" });
    expect(prisma.invoice.deleteMany).toHaveBeenCalledWith({ where: { id: "inv1", user_id: "u1" } });
  });

  it("keeps the client's billing address on the invoice and stores each logo once, by reference", async () => {
    const prisma = mockPrisma();
    const clientLogo = "data:image/png;base64,iVBORw0KGgo=";
    const sellerLogo = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    prisma.client.findFirst.mockResolvedValue({
      id: "c1",
      name: "Acme",
      legal_name: "Acme Holdings, Inc.",
      address: "500 Market St\nSan Francisco, CA",
      logo: clientLogo,
    } as never);
    prisma.authUser.findUnique.mockResolvedValue({ ...user, logo: sellerLogo } as never);
    const c = asCaller(prisma, "u1");

    // The call hands the logos back inline so the PDF can be drawn at once.
    const first = await c.invoice.create(input);
    expect(first.snapshot.client).toMatchObject({
      name: "Acme",
      legalName: "Acme Holdings, Inc.",
      address: "500 Market St\nSan Francisco, CA",
      logo: clientLogo,
    });
    expect(first.snapshot.seller.logo).toBe(sellerLogo);

    // What is stored carries no copy of either image, only their hashes.
    const stored = JSON.parse(prisma.invoice.create.mock.calls[0][0].data.snapshot as string);
    expect(stored.client.logo).toBeNull();
    expect(stored.seller.logo).toBeNull();
    expect(stored.client.logoHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.seller.logoHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain("iVBORw0KGgo");
    expect(JSON.stringify(stored)).not.toContain("/9j/4AAQ");
    expect(prisma.logoRows.map((r) => r.data).sort()).toEqual([clientLogo, sellerLogo].sort());

    // A second invoice with the same logos stores nothing new.
    await c.invoice.create({ ...input, number: "INV-2026-004" });
    expect(prisma.logoRows).toHaveLength(2);

    // Reading an invoice back puts the logos in again, from the table, for its owner only.
    const row = { id: "inv1", client_id: "c1", snapshot: JSON.stringify(stored) };
    prisma.invoice.findFirst.mockResolvedValueOnce(row as never);
    const got = await c.invoice.get({ id: "inv1" });
    expect(got.snapshot.client.logo).toBe(clientLogo);
    expect(got.snapshot.seller.logo).toBe(sellerLogo);
    prisma.invoice.findFirst.mockResolvedValueOnce(row as never);
    const other = await asCaller(prisma, "u2").invoice.get({ id: "inv1" });
    expect(other.snapshot.client.logo).toBeNull();
    expect(other.snapshot.seller.logo).toBeNull();
  });

  it("updates a client's billing details only for its owner, and rejects duplicate names and bad logos", async () => {
    const prisma = mockPrisma();
    const c = asCaller(prisma, "u1");
    await c.clients.update({
      id: "c1",
      name: "Acme",
      legalName: " Acme Holdings, Inc. ",
      address: "  500 Market St ",
      logo: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(prisma.client.findFirst).toHaveBeenCalledWith({ where: { id: "c1", user_id: "u1" } });
    expect(prisma.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: {
          name: "Acme",
          legal_name: "Acme Holdings, Inc.",
          address: "500 Market St",
          logo: "data:image/png;base64,iVBORw0KGgo=",
        },
      }),
    );

    prisma.client.update.mockClear();
    prisma.client.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      c.clients.update({ id: "nope", name: "X", legalName: "", address: "", logo: null }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // Renaming onto another client's name is a conflict.
    prisma.client.findFirst
      .mockResolvedValueOnce({ id: "c1", name: "Acme" } as never)
      .mockResolvedValueOnce({ id: "c2", name: "Globex" } as never);
    await expect(
      c.clients.update({ id: "c1", name: "Globex", legalName: "", address: "", logo: null }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      c.clients.update({
        id: "c1",
        name: "Acme",
        legalName: "",
        address: "",
        logo: "data:text/html;base64,PHNjcmlwdD4=",
      }),
    ).rejects.toThrow("PNG or JPEG");
    await expect(
      asCaller(prisma, null).clients.update({ id: "c1", name: "A", legalName: "", address: "", logo: null }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it("marks an invoice paid on a date, scoped to its owner, and can mark it unpaid again", async () => {
    const prisma = mockPrisma();
    const c = asCaller(prisma, "u1");
    await expect(c.invoice.markPaid({ id: "inv1", paidDate: "2026-10-20" })).resolves.toEqual({
      ok: true,
      paidDate: "2026-10-20",
    });
    expect(prisma.invoice.updateMany).toHaveBeenLastCalledWith({
      where: { id: "inv1", user_id: "u1" },
      data: { paid_date: "2026-10-20" },
    });

    await c.invoice.markPaid({ id: "inv1", paidDate: null });
    expect(prisma.invoice.updateMany).toHaveBeenLastCalledWith({
      where: { id: "inv1", user_id: "u1" },
      data: { paid_date: null },
    });

    // Someone else's invoice matches nothing → not found.
    prisma.invoice.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(c.invoice.markPaid({ id: "theirs", paidDate: "2026-10-20" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    prisma.invoice.updateMany.mockClear();
    await expect(c.invoice.markPaid({ id: "inv1", paidDate: "Oct 20" })).rejects.toThrow();
    await expect(asCaller(prisma, null).invoice.markPaid({ id: "inv1", paidDate: "2026-10-20" })).rejects.toMatchObject(
      { code: "UNAUTHORIZED" },
    );
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it("filters the history by payment status without losing the owner scope", async () => {
    const prisma = mockPrisma();
    const c = asCaller(prisma, "u1");
    await c.invoice.list({ status: "paid" });
    expect(prisma.invoice.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { user_id: "u1", paid_date: { not: null } } }),
    );
    await c.invoice.list({ status: "unpaid", clientId: "c1" });
    expect(prisma.invoice.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { user_id: "u1", client_id: "c1", paid_date: null } }),
    );
    await c.invoice.list({ status: "all" });
    expect(prisma.invoice.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { user_id: "u1" } }));
  });

  it("suggests the next number from the year's count", async () => {
    const prisma = mockPrisma();
    const r = await asCaller(prisma, "u1").invoice.nextNumber({ year: 2026 });
    expect(r.number).toBe("INV-2026-003");
  });

  it("business details: normalizes the EIN, clears blanks, rejects a malformed EIN or non-image logo", async () => {
    const prisma = mockPrisma();
    const c = asCaller(prisma, "u1");
    await c.account.updateBusiness({
      businessName: "  ",
      ein: "123456789",
      address: "1 Main St",
      paymentInstructions: "  Pay by ACH\nRouting 000000000  ",
      logo: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(prisma.authUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          business_name: null,
          ein: "12-3456789",
          address: "1 Main St",
          logo: "data:image/png;base64,iVBORw0KGgo=",
          payment_instructions: "Pay by ACH\nRouting 000000000",
        },
      }),
    );
    prisma.authUser.update.mockClear();
    await expect(
      c.account.updateBusiness({ businessName: "", ein: "12-345", address: "", logo: null }),
    ).rejects.toThrow();
    await expect(
      c.account.updateBusiness({ businessName: "", ein: "", address: "", logo: "data:text/html;base64,PHNjcmlwdD4=" }),
    ).rejects.toThrow();
    expect(prisma.authUser.update).not.toHaveBeenCalled();
  });

  it("leaves zero-hour entries off the invoice, in the snapshot and when re-rendering an old one", async () => {
    const zero = {
      date: "2026-10-05",
      minutes: 0,
      note: "just started",
      started_at: null,
      project_id: "p3",
      project: { name: "Idle", hourly_rate: 10000, billable: true },
    };
    const t = buildInvoice([
      zero,
      {
        ...zero,
        date: "2026-10-06",
        minutes: 60,
        note: "real work",
        project_id: "p1",
        project: { name: "Website", hourly_rate: 10000, billable: true },
      },
    ]);
    expect(t.lines.map((l) => l.project)).toEqual(["Website"]);
    expect(t.detail.map((d) => d.note)).toEqual(["real work"]);

    // An older stored snapshot that still has a 0h row renders without it.
    const doc = await buildInvoicePdf({
      seller: { name: "Jo", ein: null, address: null, email: "jo@example.com", logo: null },
      client: { name: "Acme" },
      number: "INV-1",
      issueDate: "2026-10-31",
      dueDate: null,
      periodFrom: "2026-10-01",
      periodTo: "2026-10-31",
      notes: "",
      includeDetail: true,
      lines: [
        { projectId: "p1", project: "Website", minutes: 60, rateCents: 10000, amountCents: 10000 },
        { projectId: "p3", project: "Idle", minutes: 0, rateCents: 10000, amountCents: 0 },
      ],
      detail: [
        { date: "2026-10-06", project: "Website", note: "real work", minutes: 60 },
        { date: "2026-10-05", project: "Idle", note: "just started", minutes: 0 },
      ],
      totalMinutes: 60,
      totalCents: 10000,
    });
    const text = doc.output();
    expect(text).toContain("real work");
    expect(text).not.toContain("just started");
    expect(text).not.toContain("Idle");
  });

  it("refuses to make an invoice that would total $0.00, and stores nothing", async () => {
    const prisma = mockPrisma();
    // every billable project in the period is at a $0 rate (the usual mistake: the rate was never set)
    prisma.timeEntry.findMany.mockResolvedValue([
      {
        date: "2026-10-02",
        minutes: 90,
        note: "homepage hero",
        started_at: null,
        project_id: "p1",
        project: { name: "General", hourly_rate: 0, billable: true },
      },
    ] as never);
    await expect(asCaller(prisma, "u1").invoice.create(input)).rejects.toThrow(
      /\$0\.00.*Set the rates under Clients & Projects/,
    );
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    // one project with a rate is enough: the invoice is real, the unpaid-rate project is simply listed at $0
    prisma.timeEntry.findMany.mockResolvedValue([
      {
        date: "2026-10-02",
        minutes: 60,
        note: "a",
        started_at: null,
        project_id: "p1",
        project: { name: "General", hourly_rate: 0, billable: true },
      },
      {
        date: "2026-10-03",
        minutes: 60,
        note: "b",
        started_at: null,
        project_id: "p2",
        project: { name: "Website", hourly_rate: 10000, billable: true },
      },
    ] as never);
    const { snapshot } = await asCaller(prisma, "u1").invoice.create(input);
    expect(snapshot.totalCents).toBe(10000);
  });

  it("flags zero-rate projects and running timers", () => {
    const t = buildInvoice([
      {
        date: "2026-10-02",
        minutes: 30,
        note: "",
        started_at: new Date(),
        project_id: "p9",
        project: { name: "Unrated", hourly_rate: 0, billable: true },
      },
    ]);
    expect(t.zeroRateProjects).toEqual(["Unrated"]);
    expect(t.runningTimers).toBe(1);
    expect(t.totalCents).toBe(0);
  });

  it("renders a real PDF from a stored snapshot (uncompressed so the text is checkable)", async () => {
    const snapshot: InvoiceSnapshot = {
      seller: {
        name: "Jo Design LLC",
        ein: "12-3456789",
        address: "1 Main St\nSpringfield",
        email: "jo@example.com",
        logo: null,
      },
      client: {
        name: "Acme",
        legalName: "Acme Holdings, Inc.",
        address: "500 Market St\nSan Francisco, CA 94105",
        logo: null,
      },
      number: "INV-2026-003",
      issueDate: "2026-10-31",
      dueDate: "2026-11-30",
      periodFrom: "2026-10-01",
      periodTo: "2026-10-31",
      notes: "Thanks!",
      includeDetail: true,
      lines: [{ projectId: "p1", project: "Website", minutes: 135, rateCents: 10000, amountCents: 22500 }],
      detail: [
        { date: "2026-10-02", project: "Website", note: "homepage hero", minutes: 90 },
        { date: "2026-10-03", project: "Website", note: "", minutes: 45 },
      ],
      totalMinutes: 135,
      totalCents: 22500,
    };
    expect(buildSearchText(snapshot)).toContain("website");
    const doc = await buildInvoicePdf(snapshot);
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const text = doc.output();
    for (const needle of [
      "INVOICE",
      "INV-2026-003",
      "EIN 12-3456789",
      "Acme",
      "500 Market St",
      "San Francisco, CA 94105",
      "BILL TO",
      "$225.00",
      "homepage hero",
    ]) {
      expect(text).toContain(needle);
    }
    // Work descriptions appear in the line items too (project row, then its distinct notes).
    expect(text.match(/homepage hero/g)?.length).toBe(2); // line items + time detail
    // Project and Description are separate columns; a note-less entry says so instead of going blank.
    expect(text).toContain("No description");
    expect(text).not.toContain("—");
  });
});

describe("one account cannot use invoices to fill the shared database", () => {
  const logoFor = (n: number) => `data:image/png;base64,AAAA${n}`;

  it("refuses a period longer than a year, a reversed one and a date that does not exist, and writes nothing", async () => {
    const prisma = mockPrisma();
    const c = asCaller(prisma, "u1");
    await expect(c.invoice.create({ ...input, from: "2025-01-01", to: "2026-10-31" })).rejects.toThrow(/up to a year/);
    await expect(c.invoice.create({ ...input, from: "2026-10-31", to: "2026-10-01" })).rejects.toThrow(/before/);
    await expect(c.invoice.create({ ...input, from: "2026-02-30", to: "2026-03-31" })).rejects.toThrow(/real date/);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    // exactly a leap-sized year is fine
    await c.invoice.create({ ...input, from: "2026-01-01", to: "2027-01-01", number: "INV-2026-900" });
    expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
  });

  it("stops after 30 different logos, because each stored image costs the shared database", async () => {
    const prisma = mockPrisma();
    let n = 0;
    prisma.authUser.findUnique.mockImplementation(async () => ({ ...user, logo: logoFor(n) }) as never);
    const c = asCaller(prisma, "u1");
    for (n = 0; n < 30; n++) await c.invoice.create({ ...input, number: `INV-2026-${100 + n}` });
    expect(prisma.logoRows).toHaveLength(30);
    n = 30; // a 31st different logo
    await expect(c.invoice.create({ ...input, number: "INV-2026-200" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("30 different logos"),
    });
    expect(prisma.invoice.create).toHaveBeenCalledTimes(30);
    // an already stored logo keeps working
    n = 7;
    await c.invoice.create({ ...input, number: "INV-2026-201" });
    expect(prisma.invoice.create).toHaveBeenCalledTimes(31);
    expect(prisma.logoRows).toHaveLength(30);
  });

  it("refuses an invoice whose stored copy would be enormous, and writes nothing", async () => {
    const prisma = mockPrisma();
    prisma.timeEntry.findMany.mockResolvedValue(
      Array.from({ length: 600 }, () => ({
        date: "2026-10-02",
        minutes: 10,
        note: "n".repeat(2000),
        started_at: null,
        project_id: "p1",
        project: { name: "Website", hourly_rate: 10000, billable: true },
      })) as never,
    );
    await expect(asCaller(prisma, "u1").invoice.create(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("too much detail"),
    });
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it("keeps the search text small however many entries an invoice has", async () => {
    const prisma = mockPrisma();
    prisma.timeEntry.findMany.mockResolvedValue(
      Array.from({ length: 200 }, (_, i) => ({
        date: "2026-10-02",
        minutes: 10,
        note: `${i} ${"word ".repeat(380)}`,
        started_at: null,
        project_id: "p1",
        project: { name: "Website", hourly_rate: 10000, billable: true },
      })) as never,
    );
    await asCaller(prisma, "u1").invoice.create(input);
    const stored = prisma.invoice.create.mock.calls[0][0].data as Record<string, string>;
    expect(stored.search_text.length).toBeLessThanOrEqual(50_000);
  });

  it("drops a stored logo with the last invoice that used it, and keeps it while another still does", async () => {
    const prisma = mockPrisma();
    const clientLogo = "data:image/png;base64,iVBORw0KGgo=";
    prisma.client.findFirst.mockResolvedValue({
      id: "c1",
      name: "Acme",
      legal_name: null,
      address: null,
      logo: clientLogo,
    } as never);
    const c = asCaller(prisma, "u1");
    await c.invoice.create(input);
    const snapshot = prisma.invoice.create.mock.calls[0][0].data.snapshot as string;
    expect(prisma.logoRows).toHaveLength(1);

    // another invoice still points at the same image: it stays
    prisma.invoice.findFirst
      .mockResolvedValueOnce({ snapshot } as never)
      .mockResolvedValueOnce({ id: "inv2" } as never);
    await c.invoice.delete({ id: "inv1" });
    expect(prisma.logoRows).toHaveLength(1);

    // nothing else uses it: it goes
    prisma.invoice.findFirst.mockResolvedValueOnce({ snapshot } as never);
    await c.invoice.delete({ id: "inv2" });
    expect(prisma.logoRows).toHaveLength(0);
  });
});

describe("invoice summary line", () => {
  it("lists the first distinct descriptions, then 'more'; falls back to projects and hours", async () => {
    const { summarizeInvoice } = await import("@/lib/invoice-summary");
    const line = { projectId: "p1", project: "Website", minutes: 135, rateCents: 10000, amountCents: 22500 };
    const row = (note: string) => ({ date: "2026-10-02", project: "Website", note, minutes: 30 });
    expect(
      summarizeInvoice({
        lines: [line],
        detail: [
          row("- Homepage hero\nmore text"),
          row("homepage hero"),
          row("Nav fixes"),
          row("A"),
          row("B"),
          row("C"),
        ],
      }),
    ).toBe("Homepage hero · Nav fixes · A · +2 more");
    expect(summarizeInvoice({ lines: [line], detail: [row("  "), row("")] })).toBe("Website 2.25 h");
  });

  it("stores the summary when an invoice is created", async () => {
    const prisma = mockPrisma();
    await asCaller(prisma, "u1").invoice.create(input);
    expect(prisma.invoice.create.mock.calls[0][0].data).toMatchObject({ summary: "homepage hero · nav fixes" });
  });
});
