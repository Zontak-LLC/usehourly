import { z } from "zod";

import { defineTool, type McpTool } from "./core";
import { hours, round2 } from "./format";
import { clientRef, date, invoiceRef } from "./inputs";
import { findInvoiceId, shapeInvoiceSummary, stripLogos } from "./invoice-shape";
import { resolveClient } from "./lookup";

export const INVOICE_READ_TOOLS: McpTool[] = [
  defineTool({
    name: "list_invoices",
    title: "List invoices",
    description:
      "Invoice history (newest 200 at most), each with the currency it was issued in. Filter by text, client, paid status or issue-date range. unpaid_totals has one figure per currency; unpaid_total is only set when every match is in one currency.",
    access: "read",
    idempotent: true,
    input: z.object({
      query: z
        .string()
        .trim()
        .max(100)
        .optional()
        .describe("Matches number, client, notes, project names and entry notes"),
      client: clientRef.optional().describe("Only this client: id or exact name"),
      status: z.enum(["all", "unpaid", "paid"]).default("all").describe("Filter by whether the invoice has been paid"),
      issued_from: date.describe("Only invoices issued on or after this date").optional(),
      issued_to: date.describe("Only invoices issued on or before this date").optional(),
      sort: z
        .enum(["newest", "oldest", "highest", "lowest"])
        .default("newest")
        .describe("newest/oldest by issue date, highest/lowest by total"),
    }),
    run: async (c, a) => {
      const clientId = a.client ? (await resolveClient(c, a.client)).id : undefined;
      const rows = await c.invoice.list({
        q: a.query,
        clientId,
        status: a.status,
        from: a.issued_from,
        to: a.issued_to,
        sort: a.sort,
      });
      // Amounts in different currencies are never added: one total per currency, and the single figure only when
      // every match is in the same one.
      const unpaidTotals: Record<string, number> = {};
      for (const r of rows.filter((r) => !r.paid_date))
        unpaidTotals[r.currency] = (unpaidTotals[r.currency] ?? 0) + r.total_cents;
      const unpaidByCurrency = Object.fromEntries(Object.entries(unpaidTotals).map(([k, v]) => [k, round2(v / 100)]));
      const currencies = new Set(rows.map((r) => r.currency));
      return {
        count: rows.length,
        unpaid_total: currencies.size <= 1 ? (Object.values(unpaidByCurrency)[0] ?? 0) : null,
        unpaid_totals: unpaidByCurrency,
        invoices: rows.map(shapeInvoiceSummary),
      };
    },
  }),

  defineTool({
    name: "get_invoice",
    title: "Get an invoice",
    description:
      "The frozen invoice as issued: seller, client, lines per project and totals. Set include_detail for the per-entry breakdown. Logos are left out.",
    access: "read",
    idempotent: true,
    input: z.object({
      invoice: invoiceRef,
      include_detail: z.boolean().default(false).describe("Include the per-entry breakdown under the lines"),
    }),
    run: async (c, a) => {
      const id = await findInvoiceId(c, a.invoice);
      const { snapshot } = await c.invoice.get({ id });
      const clean = stripLogos(snapshot) as Omit<typeof snapshot, "detail"> & { detail?: unknown };
      if (!a.include_detail) delete clean.detail;
      return { id, snapshot: clean };
    },
  }),

  defineTool({
    name: "next_invoice_number",
    title: "Next invoice number",
    description: "The suggested next invoice number for a year, such as INV-2026-004.",
    access: "read",
    idempotent: true,
    input: z.object({
      year: z.number().int().min(2000).max(2100).describe("Year of the invoice issue date, e.g. 2026"),
    }),
    run: (c, a) => c.invoice.nextNumber(a),
  }),
];

export const INVOICE_WRITE_TOOLS: McpTool[] = [
  // ---- invoices
  defineTool({
    name: "create_invoice",
    title: "Create an invoice",
    description:
      "Issue an invoice for a client from billable time between two dates. Totals are computed on the server from the logged entries (one line per project). Time already on another invoice is left out, so the same hours are never billed twice. The number defaults to the next free INV-<year>-NNN. This creates a permanent record; confirm the client, period and dates with the user first.",
    access: "write",
    input: z
      .object({
        client: clientRef,
        from: date.describe("First day of the billed period"),
        to: date.describe("Last day of the billed period"),
        issue_date: date.describe("The invoice date, YYYY-MM-DD"),
        due_date: date.nullable().optional().describe("Payment due date, YYYY-MM-DD, or null for none"),
        number: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .optional()
          .describe("Invoice number; defaults to the next INV-<year>-NNN"),
        notes: z.string().trim().max(1000).default("").describe("Notes printed on the invoice (max 1,000 characters)"),
        include_detail: z.boolean().default(true).describe("Print each entry under the lines"),
        compact_notes: z.boolean().default(false).describe("Shorten entry descriptions to about 100 characters"),
      })
      .refine((v) => v.from <= v.to, { message: "from must be on or before to." }),
    run: async (c, a) => {
      const cl = await resolveClient(c, a.client);
      const number = a.number ?? (await c.invoice.nextNumber({ year: Number(a.issue_date.slice(0, 4)) })).number;
      const created = await c.invoice.create({
        clientId: cl.id,
        from: a.from,
        to: a.to,
        number,
        issueDate: a.issue_date,
        dueDate: a.due_date ?? null,
        notes: a.notes,
        includeDetail: a.include_detail,
        compactNotes: a.compact_notes,
      });
      const s = created.snapshot;
      return {
        id: created.id,
        number: s.number,
        client: cl.name,
        period: `${s.periodFrom} to ${s.periodTo}`,
        hours: hours(s.totalMinutes),
        total: round2(s.totalCents / 100),
        lines: s.lines,
      };
    },
  }),

  defineTool({
    name: "mark_invoice_paid",
    title: "Mark an invoice paid or unpaid",
    description:
      "Record the date an invoice was paid (this matters for cash-basis taxes), or pass null to mark it unpaid again.",
    access: "write",
    idempotent: true,
    input: z.object({ invoice: invoiceRef, paid_date: date.nullable().describe("YYYY-MM-DD, or null for unpaid") }),
    run: async (c, a) => {
      const id = await findInvoiceId(c, a.invoice);
      return c.invoice.markPaid({ id, paidDate: a.paid_date });
    },
  }),

  defineTool({
    name: "delete_invoice",
    title: "Delete an invoice",
    description:
      "Permanently delete an invoice record. The time entries stay. Confirm with the user before calling this.",
    access: "write",
    destructive: true,
    input: z.object({ invoice: invoiceRef }),
    run: async (c, a) => {
      const id = await findInvoiceId(c, a.invoice);
      return c.invoice.delete({ id });
    },
  }),
];
