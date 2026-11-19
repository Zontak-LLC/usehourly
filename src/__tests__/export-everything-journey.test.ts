import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

import { type ExportFile, planExport, zipBytes } from "@/lib/export-all";
import type { ExportRecords } from "@/lib/export-records";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import type { SheetEntry } from "@/lib/timesheet";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { byOrder, type InvoiceOrder } from "./helpers/memory-billing";

/*
 * Issue 498: the privacy page says "You can export everything you have entered", but the "Download everything" zip held
 * time on billable days, the invoice list and expenses only. A person who leaves, or keeps the zip as a backup, lost
 * each invoice's lines, their clients' details, project rates and budgets, business details, team members and the
 * time on days marked non-billable. Through the real routers with a fake Prisma that honours `select`, so a field the
 * router does not ask for never reaches a file.
 */

const TODAY = "2026-11-18";
const FAR_FUTURE = 4_000_000_000; // unix seconds, year 2096: an invitation still open
const BOM = String.fromCharCode(0xfeff); // every CSV starts with it, so Excel reads UTF-8
const LINE = { projectId: "p1", project: "Website", minutes: 90, rateCents: 9500, amountCents: 14_250 };
const NOTE = "Thanks for the quick turnaround.";

type Row = Record<string, unknown>;
type Select = Record<string, unknown>;

/** What Prisma's `select` does: only the keys set to true (a nested `{ select }` is the caller's to resolve). */
function pick(row: Row, select: Select | undefined): Row {
  if (!select) return row;
  return Object.fromEntries(
    Object.keys(select)
      .filter((k) => select[k] === true)
      .map((k) => [k, row[k]]),
  );
}

function invoiceRow(n: number, over: Row = {}): Row {
  const number = `INV-2026-${String(n).padStart(3, "0")}`;
  const issued = `2026-${String((n % 12) + 1).padStart(2, "0")}-01`;
  const snapshot = {
    currency: "USD",
    seller: { name: "Jo LLC", ein: null, address: null, email: "jo@example.com", logo: null, logoHash: "abc123" },
    client: { name: "Acme", legalName: "Acme Corporation Ltd", address: "1 Main St", logo: null },
    number,
    issueDate: issued,
    dueDate: null,
    periodFrom: issued,
    periodTo: issued,
    notes: NOTE,
    includeDetail: false,
    lines: [LINE],
    detail: [],
    totalMinutes: 90,
    totalCents: 14_250,
  };
  return {
    id: `i${String(n).padStart(3, "0")}`,
    user_id: "u1",
    client_id: "c1",
    client_name: "Acme",
    number,
    issue_date: issued,
    due_date: null,
    paid_date: null,
    period_from: issued,
    period_to: issued,
    total_minutes: 90,
    total_cents: 14_250,
    currency: "USD",
    notes: NOTE,
    summary: "Website",
    created_at: new Date(`${issued}T12:00:00Z`),
    snapshot: JSON.stringify(snapshot),
    search_text: "inv-2026 acme website",
    ...over,
  };
}

const where = (row: Row, w: Row) => Object.entries(w).every(([k, v]) => row[k] === v);

/** 448 numbered invoices plus "A/1" and "A-1" for u1 (450 in all), and two of u2's. */
function world({ team = true } = {}) {
  const invoices: Row[] = [
    ...Array.from({ length: 448 }, (_, n) => invoiceRow(n + 1)),
    invoiceRow(449, { number: "A/1" }),
    invoiceRow(450, { number: "A-1" }),
    invoiceRow(900, { id: "x1", user_id: "u2", number: "THEIRS-1", client_name: "Stranger Ltd" }),
  ];
  const users: Row[] = [
    {
      id: "u1",
      name: "Jo",
      email: "jo@example.com",
      password_hash: "not-a-real-hash",
      business_name: "Jo LLC",
      ein: "12-3456789",
      address: "5 High St\nLeeds",
      logo: "data:image/png;base64,AAAA",
      avatar: "data:image/png;base64,BBBB",
      payment_instructions: "Bank transfer",
      tax_name: "VAT",
      tax_rate: 2000,
      tax_number: "GB123456789",
      currency: "USD",
      hourly_rate: 8000,
    },
  ];
  const client = (over: Row): Row => ({
    user_id: "u1",
    legal_name: null,
    address: null,
    email: null,
    logo: "data:image/png;base64,CCCC",
    currency: null,
    color: "#6366f1",
    round_step: 0,
    round_mode: "up",
    round_min: 0,
    invoice_every: null,
    invoice_anchor: null,
    archived: false,
    ...over,
  });
  const clients: Row[] = [
    client({ id: "c2", name: "Old Co", currency: "EUR", archived: true }),
    client({
      id: "c1",
      name: "Acme",
      legal_name: "Acme Corporation Ltd",
      address: "1 Main St\nSpringfield",
      email: "billing@acme.test",
      color: "#10b981",
      round_step: 15,
      invoice_every: "month",
    }),
    client({ id: "c9", user_id: "u2", name: "Stranger Ltd" }),
  ];
  const project = (over: Row): Row => ({
    user_id: "u1",
    hourly_rate: 0,
    billable: true,
    logo: "data:image/png;base64,DDDD",
    archived: false,
    budget_amount: null,
    budget_unit: null,
    budget_period: "month",
    ...over,
  });
  const projects: Row[] = [
    project({
      id: "p1",
      client_id: "c1",
      name: "Website",
      hourly_rate: 9500,
      budget_amount: 600,
      budget_unit: "hours",
    }),
    project({ id: "p2", client_id: "c1", name: "Admin", billable: false }),
    project({
      id: "p3",
      client_id: "c2",
      name: "Legacy",
      hourly_rate: 5000,
      budget_amount: 50_000,
      budget_unit: "dollars",
      budget_period: "total",
      archived: true,
    }),
    project({ id: "p9", user_id: "u2", client_id: "c9", name: "Stranger Project", hourly_rate: 1 }),
  ];
  const member = (over: Row): Row => ({
    owner_id: "u1",
    member_id: null,
    token_hash: "deadbeef",
    expires_at: null,
    accepted_at: null,
    revoked_at: null,
    ...over,
  });
  const teamMembers: Row[] = team
    ? [
        member({ id: "t2", label: "Pat Kim", email: "pat@example.test", expires_at: FAR_FUTURE, created_at: 2 }),
        member({ id: "t1", label: "Sam Lee", email: "sam@example.test", member_id: "u7", created_at: 1 }),
        member({ id: "t9", owner_id: "u2", label: "Stranger Member", email: "x@example.test", created_at: 0 }),
      ]
    : [];

  const prisma = {
    invoice: {
      findMany: vi.fn(
        async (args: {
          where: Row;
          select?: Select;
          orderBy?: InvoiceOrder;
          take?: number;
          cursor?: { id: string };
        }) => {
          const found = invoices.filter((i) => where(i, args.where));
          if (args.orderBy) found.sort(byOrder(args.orderBy) as (a: Row, b: Row) => number);
          const from = args.cursor ? found.findIndex((i) => i.id === args.cursor?.id) : 0;
          const end = args.take === undefined ? undefined : from + args.take;
          return found.slice(from, end).map((i) => pick(i, args.select));
        },
      ),
      findFirst: vi.fn(async () => null),
      update: vi.fn(),
    },
    authUser: {
      findUnique: vi.fn(
        async (args: { where: { id: string }; select?: Select }) =>
          users.filter((u) => u.id === args.where.id).map((u) => pick(u, args.select))[0] ?? null,
      ),
    },
    client: {
      findMany: vi.fn(async (args: { where: Row; select?: Select }) =>
        clients.filter((c) => where(c, args.where)).map((c) => pick(c, args.select)),
      ),
    },
    project: {
      findMany: vi.fn(async (args: { where: Row; select?: Select }) =>
        projects
          .filter((p) => where(p, args.where))
          .map((p) => {
            const nested = args.select?.client as { select?: Select } | undefined;
            const owner = clients.find((c) => c.id === p.client_id) ?? {};
            return { ...pick(p, args.select), ...(nested ? { client: pick(owner, nested.select) } : {}) };
          }),
      ),
    },
    teamMember: {
      findMany: vi.fn(async (args: { where: Row; select?: Select; orderBy?: { created_at: "asc" } }) => {
        const found = teamMembers.filter((m) => where(m, args.where));
        if (args.orderBy) found.sort((a, b) => Number(a.created_at) - Number(b.created_at));
        return found.map((m) => pick(m, args.select));
      }),
    },
  };
  const as = (userId: string) =>
    createCallerFactory(appRouter)({ prisma, userId, session: { user: { id: userId } } } as never);
  return { prisma, as };
}

function entry(over: Partial<SheetEntry> & { id: string; date: string }): SheetEntry {
  return {
    project_id: "p1",
    minutes: 60,
    note: "",
    started_at: null,
    project: { name: "Website", hourly_rate: 9500, billable: true, client: { name: "Acme", color: "#10b981" } },
    ...over,
  };
}

const ENTRIES: SheetEntry[] = [
  entry({ id: "e1", date: "2026-11-02", note: "hero" }),
  entry({ id: "e2", date: "2026-11-03", note: "on a day off the books", non_billable: true }),
  entry({ id: "e3", date: "2026-11-03", minutes: 0, note: "timer just started" }),
];

const text = (files: ExportFile[], path: string) => {
  const file = files.find((f) => f.path === path);
  if (!file) throw new Error(`${path} is not in the zip`);
  return String(file.content);
};

/** Every key anywhere in a value (objects and arrays, all levels). */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);
  return [];
}

const FORBIDDEN = ["search_text", "token_hash", "password_hash", "logo"];

async function fullInvoices(as: ReturnType<typeof world>["as"]) {
  return fetchAllPages((cursor) => as("u1").invoice.listAll({ cursor, detail: "full" }));
}

describe("invoice.listAll with detail: full carries every invoice's notes and frozen snapshot", () => {
  it("pages 450 invoices, each with its notes and the parsed snapshot", async () => {
    const { prisma, as } = world();
    const invoices = await fullInvoices(as);
    expect(invoices).toHaveLength(450);
    for (const i of invoices) {
      expect(i.notes).toBe(NOTE);
      expect(i.snapshot?.lines[0]).toEqual(LINE);
    }
    expect(prisma.invoice.findMany.mock.calls[0][0].where).toEqual({ user_id: "u1" });
    expect(prisma.invoice.findMany.mock.calls[0][0].select).toMatchObject({ snapshot: true, notes: true });
    for (const i of invoices) {
      for (const key of FORBIDDEN) expect(Object.keys(i)).not.toContain(key);
    }
  });

  it("without detail it answers as before: the list row, no snapshot", async () => {
    const { prisma, as } = world();
    const page = await as("u1").invoice.listAll({ cursor: null });
    expect(page.items).toHaveLength(450);
    expect(prisma.invoice.findMany.mock.calls[0][0].select).toMatchObject({ snapshot: false });
    for (const i of page.items) expect(Object.keys(i)).not.toContain("snapshot");
    // `notes` was in the summary row already (Totals, Overdue tab and Invoices read it), so it stays
    expect(page.items[0].notes).toBe(NOTE);
    expect(Object.keys(page.items[0]).sort()).toEqual(
      [
        "id",
        "client_id",
        "client_name",
        "number",
        "issue_date",
        "due_date",
        "paid_date",
        "period_from",
        "period_to",
        "total_minutes",
        "total_cents",
        "currency",
        "notes",
        "summary",
        "created_at",
      ].sort(),
    );
  });

  it("refuses an unknown detail and never reads the database", async () => {
    const { prisma, as } = world();
    await expect(as("u1").invoice.listAll({ cursor: null, detail: "bogus" } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });
});

describe("the zip holds one JSON file per invoice", () => {
  it("writes 450 files under invoices/, each the invoice as issued, with safe and unique names", async () => {
    const { as } = world();
    const invoices = await fullInvoices(as);
    const plan = await planExport({ entries: ENTRIES, invoices, today: TODAY });
    const invoiceFiles = plan.files.filter((f) => f.path.startsWith("invoices/"));
    expect(invoiceFiles).toHaveLength(450);

    const first = JSON.parse(text(plan.files, "invoices/INV-2026-001.json"));
    expect(first).toMatchObject({
      number: "INV-2026-001",
      clientName: "Acme",
      totalMinutes: 90,
      totalCents: 14_250,
      currency: "USD",
      notes: NOTE,
    });
    expect(first.snapshot.lines[0]).toEqual(LINE);
    expect(first.snapshot.seller.logoHash).toBe("abc123"); // written as stored: a logo stays a hash

    // "A/1" and "A-1": two different names, no slash inside the folder
    const odd = invoiceFiles.map((f) => f.path).filter((p) => p.startsWith("invoices/A"));
    expect(odd.sort()).toEqual(["invoices/A 1.json", "invoices/A-1.json"]);
    for (const f of invoiceFiles) expect(f.path.split("/")).toHaveLength(2);
    expect(new Set(invoiceFiles.map((f) => f.path)).size).toBe(450);

    const readme = text(plan.files, "README.txt");
    expect(readme).not.toContain("200 most recent");
    expect(readme).toContain("invoices.csv       Your invoice history (450).");
    expect(readme).toContain("  invoices/          One file per invoice: its lines, seller and client, as issued.");
    expect(readme).toContain(
      "Logos and invoice PDFs are not included; each PDF can be made again from its invoices/*.json file.",
    );
  });
});

describe("time on days marked non-billable is in all-entries.csv, flagged, and out of the workbooks", () => {
  it("one entry: Billable day = No, no amount, the singular README line, not in all-time.xlsx", async () => {
    const plan = await planExport({ entries: ENTRIES, invoices: [], today: TODAY });
    const lines = text(plan.files, "all-entries.csv").replace(BOM, "").split("\r\n");
    expect(lines[0]).toBe(
      "Date,Client,Project,Note,Hours,Minutes,Billable,Rate (per hour),Amount,Currency,Billable day",
    );
    expect(lines.slice(1, -1)).toEqual([
      "2026-11-02,Acme,Website,hero,1,60,Yes,95,95,USD,Yes",
      "2026-11-03,Acme,Website,on a day off the books,1,60,Yes,95,,USD,No",
    ]);
    expect(plan.entryCount).toBe(2);
    expect(plan.totalMinutes).toBe(120);
    expect(text(plan.files, "README.txt")).toContain(
      "\r\n1 entry is on a day marked non-billable: it is in all-entries.csv (Billable day = No), not in the workbooks.\r\n",
    );

    const zip = await JSZip.loadAsync(await zipBytes(plan));
    const workbook = await zip.file("all-time.xlsx")?.async("uint8array");
    const ExcelJS = (await import("exceljs")).default;
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(workbook?.buffer as ArrayBuffer);
    const cells: unknown[] = [];
    book.getWorksheet("Entries")?.eachRow((row) => cells.push(...(row.values as unknown[])));
    expect(cells).toContain("hero");
    expect(cells).not.toContain("on a day off the books");
  });

  it("two entries: the plural README line", async () => {
    const twice = [...ENTRIES, entry({ id: "e4", date: "2026-11-04", note: "another", non_billable: true })];
    const plan = await planExport({ entries: twice, invoices: [], today: TODAY });
    expect(text(plan.files, "README.txt")).toContain(
      "\r\n2 entries are on days marked non-billable: they are in all-entries.csv (Billable day = No), not in the workbooks.\r\n",
    );
  });
});

describe("dataExport.records puts clients, projects, business details and team in the zip", () => {
  async function zipFor(team = true) {
    const w = world({ team });
    const records: ExportRecords = await w.as("u1").dataExport.records();
    const plan = await planExport({ entries: ENTRIES, invoices: await fullInvoices(w.as), records, today: TODAY });
    return { ...w, records, plan };
  }

  it("clients.csv: legal name, multi-line address and email as entered; archived clients too", async () => {
    const { plan } = await zipFor();
    expect(text(plan.files, "clients.csv")).toBe(
      `${BOM}Name,Legal name,` +
        "Address,Email,Currency,Colour,Rounding step (minutes),Rounding mode,Minimum minutes," +
        "Invoice every,Invoice anchor,Archived\r\n" +
        'Acme,Acme Corporation Ltd,"1 Main St\nSpringfield",billing@acme.test,USD,#10b981,15,up,0,month,,No\r\n' +
        "Old Co,,,,EUR,#6366f1,0,up,0,,,Yes\r\n",
    );
  });

  it("projects.csv: rate in money, an hours budget in hours, a money budget in money", async () => {
    const { plan } = await zipFor();
    expect(text(plan.files, "projects.csv")).toBe(
      `${BOM}Client,Project,` +
        "Rate (per hour),Billable,Budget,Budget unit,Budget period,Archived\r\n" +
        "Acme,Admin,0,No,,,,No\r\n" +
        "Acme,Website,95,Yes,10,hours,month,No\r\n" +
        "Old Co,Legacy,50,Yes,500,dollars,total,Yes\r\n",
    );
  });

  it("business.json: the details printed on invoices, tax in percent", async () => {
    const { plan } = await zipFor();
    expect(JSON.parse(text(plan.files, "business.json"))).toEqual({
      name: "Jo",
      email: "jo@example.com",
      businessName: "Jo LLC",
      ein: "12-3456789",
      address: "5 High St\nLeeds",
      paymentInstructions: "Bank transfer",
      taxName: "VAT",
      taxRatePercent: 20,
      taxNumber: "GB123456789",
      currency: "USD",
      defaultHourlyRate: 80,
    });
  });

  it("team.csv: name, email and role, oldest invitation first; no file with no team", async () => {
    const { plan } = await zipFor();
    expect(text(plan.files, "team.csv")).toBe(
      `${BOM}Name,Email,Role\r\nSam Lee,sam@example.test,Member\r\nPat Kim,pat@example.test,Invited\r\n`,
    );
    expect(text(plan.files, "README.txt")).toContain("  team.csv           The people you invited");

    const alone = await zipFor(false);
    expect(alone.plan.files.map((f) => f.path)).not.toContain("team.csv");
    expect(alone.plan.files.map((f) => f.path)).toEqual(
      expect.arrayContaining(["clients.csv", "projects.csv", "business.json"]),
    );
  });

  it("reads only the caller's rows, and none of another account's names reach any file", async () => {
    const { prisma, plan } = await zipFor();
    expect(prisma.client.findMany.mock.calls[0][0].where).toEqual({ user_id: "u1" });
    expect(prisma.project.findMany.mock.calls[0][0].where).toEqual({ user_id: "u1" });
    expect(prisma.teamMember.findMany.mock.calls[0][0].where).toEqual({ owner_id: "u1" });
    expect(prisma.authUser.findUnique.mock.calls[0][0].where).toEqual({ id: "u1" });
    const everything = plan.files.map((f) => (typeof f.content === "string" ? f.content : "")).join("\n");
    for (const theirs of ["Stranger Ltd", "Stranger Project", "Stranger Member", "THEIRS-1"]) {
      expect(everything).not.toContain(theirs);
    }
  });

  it("sends no logo, search text, token or password hash", async () => {
    const { records } = await zipFor();
    for (const key of FORBIDDEN) expect(keysOf(records)).not.toContain(key);
    expect(JSON.stringify(records)).not.toContain("deadbeef");
    expect(JSON.stringify(records)).not.toContain("data:image");
  });

  it("refuses a signed-out caller and reads nothing", async () => {
    const { prisma } = world();
    const anon = createCallerFactory(appRouter)({ prisma, session: null } as never);
    await expect(anon.dataExport.records()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(prisma.authUser.findUnique).not.toHaveBeenCalled();
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });
});
