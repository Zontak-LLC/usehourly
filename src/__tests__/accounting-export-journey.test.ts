import { describe, expect, it, vi } from "vitest";

import {
  accountingFileName,
  buildAccountingCsv,
  cleanOptions,
  formatDate,
  paymentsCsv,
  quickbooksInvoicesCsv,
  xeroInvoicesCsv,
} from "@/lib/accounting-export";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

/** A small RFC 4180 reader, so the tests see the file the way an import does (quotes, commas and line breaks inside fields). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // part of the line break
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  return rows;
}

type Row = {
  user_id: string;
  number: string;
  issue_date: string;
  due_date: string | null;
  paid_date: string | null;
  total_cents: number;
  client_id: string | null;
  created_at: number;
  snapshot: string;
};

const snap = (over: {
  number: string;
  client: { name: string; legalName?: string | null; address?: string | null };
  lines: { project: string; minutes: number; rateCents: number; amountCents: number }[];
  notes?: string;
}) =>
  JSON.stringify({
    number: over.number,
    periodFrom: "2026-01-01",
    periodTo: "2026-03-31",
    notes: over.notes ?? "",
    client: over.client,
    lines: over.lines,
  });

const INVOICES: Row[] = [
  {
    user_id: "u1",
    number: "INV-2026-001",
    issue_date: "2026-03-31",
    due_date: "2026-04-30",
    paid_date: "2026-04-12",
    total_cents: 31000,
    client_id: "c1",
    created_at: 1,
    snapshot: snap({
      number: "INV-2026-001",
      client: {
        name: "Acme",
        legalName: "Acme Holdings, Inc.",
        address: "500 Market St\nSuite 4\nSan Francisco, CA 94105",
      },
      lines: [
        { project: "Website", minutes: 150, rateCents: 10000, amountCents: 25000 },
        { project: "Admin", minutes: 45, rateCents: 8000, amountCents: 6000 },
      ],
      notes: "Thank you, truly.\nPay by ACH.",
    }),
  },
  {
    user_id: "u1",
    number: "INV-2026-002",
    issue_date: "2026-06-30",
    due_date: null,
    paid_date: null,
    total_cents: 15000,
    client_id: "c2",
    created_at: 2,
    snapshot: snap({
      number: "INV-2026-002",
      client: { name: '=HYPERLINK("http://evil.example","pay")' },
      lines: [{ project: 'App "v2"', minutes: 90, rateCents: 10000, amountCents: 15000 }],
    }),
  },
  { ...invoiceFor("u1", "INV-2025-009", "2025-12-15"), created_at: 0 }, // another year
  { ...invoiceFor("u2", "INV-2026-050", "2026-04-01"), created_at: 3 }, // another account, same year
];

function invoiceFor(user_id: string, number: string, issue_date: string): Row {
  return {
    user_id,
    number,
    issue_date,
    due_date: issue_date,
    paid_date: null,
    total_cents: 1000,
    client_id: "cx",
    created_at: 0,
    snapshot: snap({
      number,
      client: { name: "Other" },
      lines: [{ project: "Other work", minutes: 60, rateCents: 1000, amountCents: 1000 }],
    }),
  };
}

function world(rows: Row[] = INVOICES) {
  const prisma = {
    invoice: {
      findMany: vi.fn(
        async ({
          where,
          take,
        }: {
          where: { user_id: string; issue_date: { gte: string; lte: string } };
          take: number;
        }) =>
          rows
            .filter(
              (r) =>
                r.user_id === where.user_id &&
                r.issue_date >= where.issue_date.gte &&
                r.issue_date <= where.issue_date.lte,
            )
            .sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.created_at - b.created_at)
            .slice(0, take),
      ),
    },
    client: {
      findMany: vi.fn(async ({ where }: { where: { user_id: string; id: { in: string[] } } }) =>
        [
          { id: "c1", user_id: "u1", email: "ap@acme.example" },
          { id: "c2", user_id: "u1", email: null },
          { id: "cx", user_id: "u2", email: "secret@other.example" },
        ].filter((c) => c.user_id === where.user_id && where.id.in.includes(c.id)),
      ),
    },
  };
  const as = (id: string | null) =>
    createCaller({
      session: id ? ({ user: { id }, expires: "" } as never) : null,
      prisma: prisma as never,
    });
  return { prisma, as };
}

const YEAR = { from: "2026-01-01", to: "2026-12-31" };
const XERO_COLUMNS = 27;

describe("exporting invoices for an accounting app", () => {
  it("hands over the caller's invoices for the period, oldest first, with lines and the client's email", async () => {
    const { prisma, as } = world();
    const { invoices, more } = await as("u1").accounting.invoices(YEAR);

    expect(more).toBe(false);
    expect(invoices.map((i) => i.number)).toEqual(["INV-2026-001", "INV-2026-002"]); // not the 2025 one, not the stranger's
    expect(invoices[0]).toMatchObject({
      issueDate: "2026-03-31",
      dueDate: "2026-04-30",
      paidDate: "2026-04-12",
      totalCents: 31000,
      periodFrom: "2026-01-01",
      periodTo: "2026-03-31",
      notes: "Thank you, truly.\nPay by ACH.",
      client: { name: "Acme", legalName: "Acme Holdings, Inc.", email: "ap@acme.example" },
    });
    expect(invoices[0].lines).toHaveLength(2);
    expect(invoices[1].client.email).toBeNull();
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ user_id: "u1" }) }),
    );
    // another account sees only its own, and only its own client's address
    const theirs = await as("u2").accounting.invoices(YEAR);
    expect(theirs.invoices.map((i) => i.number)).toEqual(["INV-2026-050"]);
    expect(theirs.invoices[0].client.email).toBe("secret@other.example");
  });

  it("makes a Xero file with one row per line, the invoice number repeated, and every row the full width", async () => {
    const { invoices } = await world().as("u1").accounting.invoices(YEAR);
    const rows = parseCsv(xeroInvoicesCsv(invoices));

    expect(rows[0][0]).toBe("*ContactName");
    expect(rows[0]).toHaveLength(XERO_COLUMNS);
    expect(rows.slice(1).every((r) => r.length === XERO_COLUMNS)).toBe(true);
    expect(rows).toHaveLength(1 + 3); // two lines on the first invoice, one on the second

    const col = (name: string) => rows[0].indexOf(name);
    const first = rows[1];
    expect(first[col("*ContactName")]).toBe("Acme Holdings, Inc.");
    expect(first[col("EmailAddress")]).toBe("ap@acme.example");
    expect([first[col("POAddressLine1")], first[col("POAddressLine2")], first[col("POAddressLine3")]]).toEqual([
      "500 Market St",
      "Suite 4",
      "San Francisco, CA 94105",
    ]);
    expect(first[col("*InvoiceNumber")]).toBe("INV-2026-001");
    expect(rows[2][col("*InvoiceNumber")]).toBe("INV-2026-001");
    expect(first[col("*InvoiceDate")]).toBe("03/31/2026");
    expect(first[col("*DueDate")]).toBe("04/30/2026");
    expect(first[col("*Description")]).toBe("Website, 01/01/2026 to 03/31/2026");
    expect(first[col("*Quantity")]).toBe("2.5000");
    expect(first[col("*UnitAmount")]).toBe("100.00");
    expect(first[col("*AccountCode")]).toBe("200");
    expect(first[col("*TaxType")]).toBe("Tax Exempt");
    expect(rows[2][col("*Quantity")]).toBe("0.7500");
    expect(rows[2][col("*UnitAmount")]).toBe("80.00");
    // an invoice with no due date is due the day it is issued, because Xero requires one
    expect(rows[3][col("*DueDate")]).toBe(rows[3][col("*InvoiceDate")]);
  });

  it("follows the chosen date format, account code, tax type and item name, and falls back when they are blank", async () => {
    const { invoices } = await world().as("u1").accounting.invoices(YEAR);
    const xero = parseCsv(xeroInvoicesCsv(invoices, { dateStyle: "eu", accountCode: "4000", taxType: "No VAT" }));
    const i = (n: string) => xero[0].indexOf(n);
    expect(xero[1][i("*InvoiceDate")]).toBe("31/03/2026");
    expect(xero[1][i("*AccountCode")]).toBe("4000");
    expect(xero[1][i("*TaxType")]).toBe("No VAT");

    const iso = parseCsv(xeroInvoicesCsv(invoices, { dateStyle: "iso" }));
    expect(iso[1][i("*InvoiceDate")]).toBe("2026-03-31");

    expect(cleanOptions({ accountCode: "   ", taxType: "", itemName: "\n\t" })).toEqual({
      dateStyle: "us",
      accountCode: "200",
      taxType: "Tax Exempt",
      itemName: "Services",
    });
    // line breaks cannot sneak into a setting and split a row
    expect(cleanOptions({ taxType: "No\r\nVAT" }).taxType).toBe("No VAT");
    expect(formatDate("2026-10-05", "us")).toBe("10/05/2026");
    expect(formatDate("2026-10-05", "eu")).toBe("05/10/2026");
  });

  it("makes a QuickBooks file whose amounts add up to each invoice's total", async () => {
    const { invoices } = await world().as("u1").accounting.invoices(YEAR);
    const rows = parseCsv(quickbooksInvoicesCsv(invoices, { itemName: "Consulting" }));
    expect(rows[0]).toEqual([
      "InvoiceNo",
      "Customer",
      "InvoiceDate",
      "DueDate",
      "Terms",
      "Location",
      "Memo",
      "Item(Product/Service)",
      "ItemDescription",
      "ItemQuantity",
      "ItemRate",
      "ItemAmount",
      "Service Date",
    ]);
    const data = rows.slice(1);
    expect(data.every((r) => r.length === rows[0].length)).toBe(true);
    expect(data[0][7]).toBe("Consulting");
    expect(data[0][6]).toBe("Thank you, truly.\nPay by ACH."); // a note with a comma and a line break survives
    for (const inv of invoices) {
      const sum = data.filter((r) => r[0] === inv.number).reduce((a, r) => a + Math.round(Number(r[11]) * 100), 0);
      expect(sum).toBe(inv.totalCents);
    }
  });

  it("lists only paid invoices in the payments file, with the date paid and the amount", async () => {
    const { invoices } = await world().as("u1").accounting.invoices(YEAR);
    expect(parseCsv(paymentsCsv(invoices))).toEqual([
      ["InvoiceNumber", "Customer", "PaymentDate", "Amount"],
      ["INV-2026-001", "Acme Holdings, Inc.", "04/12/2026", "310.00"],
    ]);
    expect(parseCsv(buildAccountingCsv("payments", [])).length).toBe(1); // nothing paid: just the header
  });

  it("keeps a client's name from running as a spreadsheet formula, and quotes the rest", async () => {
    const { invoices } = await world().as("u1").accounting.invoices(YEAR);
    for (const kind of ["xero", "quickbooks"] as const) {
      const rows = parseCsv(buildAccountingCsv(kind, invoices));
      const evil = rows.find((r) => r.some((c) => c.includes("HYPERLINK")));
      expect(evil?.find((c) => c.includes("HYPERLINK"))?.startsWith("'=")).toBe(true);
      const quoted = rows.find((r) => r.some((c) => c.includes('App "v2"')));
      expect(quoted?.some((c) => c.includes('App "v2"'))).toBe(true);
    }
  });

  it("names the file by kind and period", () => {
    expect(accountingFileName("xero", "2026-01-01", "2026-12-31")).toBe("usehourly-xero-2026.csv");
    expect(accountingFileName("quickbooks", "2000-01-01", "2100-12-31")).toBe(
      "usehourly-quickbooks-2000-01-01_to_2100-12-31.csv",
    );
  });

  it("says when there is more than one request can hold, and returns nothing for an empty period", async () => {
    const many = Array.from({ length: 205 }, (_, i) => ({
      ...invoiceFor("u1", `INV-2026-${String(i).padStart(3, "0")}`, "2026-05-01"),
      created_at: i,
    }));
    const full = await world(many).as("u1").accounting.invoices(YEAR);
    expect(full.invoices).toHaveLength(200);
    expect(full.more).toBe(true);

    const none = await world().as("u1").accounting.invoices({ from: "2024-01-01", to: "2024-12-31" });
    expect(none).toEqual({ invoices: [], more: false });
    expect(parseCsv(xeroInvoicesCsv(none.invoices))).toHaveLength(1);
  });

  it("refuses bad or reversed dates and signed-out callers without touching the database", async () => {
    const { prisma, as } = world();
    for (const bad of [
      { from: "2026-02-30", to: "2026-12-31" },
      { from: "2026-01-01", to: "12/31/2026" },
      { from: "2026-12-31", to: "2026-01-01" },
      { from: "2026-01-01" },
    ]) {
      await expect(as("u1").accounting.invoices(bad as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(as(null).accounting.invoices(YEAR)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });
});
