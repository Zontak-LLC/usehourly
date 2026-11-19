import { describe, expect, it, vi } from "vitest";

import { OUTPUT_SCHEMAS } from "@/server/mcp/output-schemas";
import { handleMcp } from "@/server/mcp/protocol";
import { callerFor } from "@/server/mcp/tools";
import { findInvoiceId } from "@/server/mcp/tools/invoice-shape";

import {
  C1_CENTS,
  C1_UNPAID,
  EUR_CENTS,
  euroInvoices,
  OLDEST_NUMBER,
  seedBeyond200,
  U1_UNPAID_CENTS,
} from "./helpers/invoices-beyond-200";
import { fakeInvoices, type HistoryRow } from "./helpers/memory-invoice-history";

/*
 * An AI assistant works with an account of 208 invoices: list_invoices counts and sums every match (its rows stop at
 * 200), and get_invoice finds an invoice by number however old it is.
 */

const CLIENTS = [
  { id: "c1", name: "Acme", user_id: "u1", projects: [] },
  { id: "c2", name: "Globex", user_id: "u1", projects: [] },
];

type ListResult = {
  count: number;
  listed: number;
  unpaid_total: number | null;
  unpaid_totals: Record<string, number>;
  invoices: { id: string; number: string; client: string; status: string; issue_date: string }[];
};

/** Calls one tool as u1 through the real MCP protocol code; a list_invoices result must match its output schema. */
function assistant(table: HistoryRow[]) {
  const db = fakeInvoices(table);
  const prisma = { ...db.prisma, client: { findMany: vi.fn(async () => CLIENTS) } };
  let id = 0;
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await handleMcp(
      { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } },
      { prisma: prisma as never, auth: { userId: "u1", access: "write" } as never },
    );
    const result = (
      res.body as { result: { isError: boolean; content: { text: string }[]; structuredContent?: unknown } }
    ).result;
    // list_invoices' contract changed here; get_invoice's snapshot schema is covered by mcp-journey.test.ts.
    if (!result.isError && name === "list_invoices") {
      expect(OUTPUT_SCHEMAS[name].safeParse(result.structuredContent).success).toBe(true);
    }
    return { isError: result.isError, text: result.content[0].text, data: result.structuredContent };
  };
  return { call, prisma, db };
}

describe("list_invoices counts and sums every match", () => {
  it("no filters: count 208, listed 200, and the unpaid money over all 208", async () => {
    const { call } = assistant(seedBeyond200());
    const { data } = await call("list_invoices");
    const list = data as ListResult;
    expect(list.count).toBe(208);
    expect(list.listed).toBe(200);
    expect(list.invoices).toHaveLength(200);
    expect(list.unpaid_totals).toEqual({ USD: U1_UNPAID_CENTS / 100 });
    expect(list.unpaid_total).toBe(21_300);
  });

  it("a query finds the oldest invoice by its number", async () => {
    const { call } = assistant(seedBeyond200());
    const list = (await call("list_invoices", { query: OLDEST_NUMBER })).data as ListResult;
    expect(list.invoices.map((i) => [i.id, i.number])).toEqual([["a204", OLDEST_NUMBER]]);
    expect(list).toMatchObject({ count: 1, listed: 1 });
  });

  it("Acme, unpaid, oldest first: all 203 counted and summed, 200 listed, oldest unpaid first", async () => {
    const { call } = assistant(seedBeyond200());
    const list = (await call("list_invoices", { client: "c1", status: "unpaid", sort: "oldest" })).data as ListResult;
    expect(list.count).toBe(C1_UNPAID);
    expect(list.count).toBe(203);
    expect(list.listed).toBe(Math.min(200, list.count));
    expect(list.unpaid_totals).toEqual({ USD: (C1_UNPAID * C1_CENTS) / 100 });
    expect(list.unpaid_total).toBe(20_300);
    expect(list.invoices[0].number).toBe(OLDEST_NUMBER);
    expect(list.invoices.every((i) => i.client === "Acme" && i.status === "unpaid")).toBe(true);
    const dates = list.invoices.map((i) => i.issue_date);
    expect(dates).toEqual([...dates].sort());
  });

  it("two currencies are never added: unpaid_total is null, one figure per currency", async () => {
    const { call } = assistant([...seedBeyond200(), ...euroInvoices()]);
    const unpaid = (await call("list_invoices", { status: "unpaid" })).data as ListResult;
    expect(unpaid.unpaid_total).toBeNull();
    expect(unpaid.unpaid_totals).toEqual({ USD: 21_300, EUR: (EUR_CENTS[0] + EUR_CENTS[1]) / 100 });
    expect(unpaid.unpaid_totals.EUR).toBe(200);
    expect(unpaid.count).toBe(207);

    const acme = (await call("list_invoices", { client: "c1", status: "unpaid" })).data as ListResult;
    expect(acme.unpaid_total).toBe(acme.unpaid_totals.USD);
    expect(acme.unpaid_total).toBe(20_300);
  });
});

describe("get_invoice finds an invoice by number, however old", () => {
  it("'inv-1999-001' in lower case is u1's oldest invoice, not u2's of the same number", async () => {
    const { call } = assistant(seedBeyond200());
    const got = await call("get_invoice", { invoice: "inv-1999-001" });
    expect(got.isError, got.text).toBe(false);
    expect((got.data as { id: string }).id).toBe("a204");
  });

  it("finds it on a later page when 204 newer invoices mention that number too", async () => {
    // Every newer Acme invoice's notes say "replaces INV-1999-001", so the first 200 search matches are all newer ones.
    const table = seedBeyond200().map((r) =>
      r.client_id === "c1" && r.number !== OLDEST_NUMBER
        ? { ...r, search_text: `${r.search_text} replaces inv-1999-001` }
        : r,
    );
    const { call, db } = assistant(table);
    const got = await call("get_invoice", { invoice: OLDEST_NUMBER });
    expect(got.isError, got.text).toBe(false);
    expect((got.data as { id: string }).id).toBe("a204");
    expect(db.invoice.findMany.mock.calls.filter(([a]) => a.where.search_text)).toHaveLength(2);
  });

  it("a number nobody has is NOT_FOUND, said plainly", async () => {
    const { call, prisma } = assistant(seedBeyond200());
    const none = await call("get_invoice", { invoice: "INV-0000-000" });
    expect(none).toMatchObject({ isError: true, text: 'No invoice numbered "INV-0000-000".' });
    await expect(findInvoiceId(callerFor(prisma as never, "u1"), "INV-0000-000")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: 'No invoice numbered "INV-0000-000".',
    });
  });
});
