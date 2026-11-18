import { describe, expect, it } from "vitest";

import { flattenInvoicePages, listPageInput, partialMonth } from "@/lib/invoice-pages";

/* The rules behind Invoices' "Load more" (issue 499): one list from the loaded pages, the month the next page may still
 * add to, and the server input for the tab and the search box. */

describe("the loaded pages as one list", () => {
  it("keeps every page's invoices in order, and gives [] before any page is in", () => {
    const [a, b, c] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(flattenInvoicePages([{ items: [a, b] }, { items: [c] }])).toEqual([a, b, c]);
    expect(flattenInvoicePages(undefined)).toEqual([]);
    expect(flattenInvoicePages([])).toEqual([]);
  });
});

describe("the month at the load edge", () => {
  const loaded = [{ issue_date: "2024-05-02" }, { issue_date: "2024-04-30" }, { issue_date: "2024-03-14" }];

  it("is the last loaded invoice's month while more may follow, so its sum is not shown short", () => {
    expect(partialMonth(loaded, { hasMore: true })).toBe("2024-03");
  });

  it("is none once everything is loaded, or with nothing loaded", () => {
    expect(partialMonth(loaded, { hasMore: false })).toBeUndefined();
    expect(partialMonth([], { hasMore: true })).toBeUndefined();
  });
});

describe("the server input for a tab and a search", () => {
  const today = "2026-11-18";

  it("All asks for everything, Paid for paid ones, Waiting and Overdue with today", () => {
    expect(listPageInput({ tab: "all", search: "", today })).toEqual({});
    expect(listPageInput({ tab: "paid", search: "", today })).toEqual({ status: "paid" });
    expect(listPageInput({ tab: "waiting", search: "", today })).toEqual({ status: "waiting", today });
    expect(listPageInput({ tab: "overdue", search: "", today })).toEqual({ status: "overdue", today });
  });

  it("a typed search is sent trimmed with the tab; an empty or blank one sends no q", () => {
    expect(listPageInput({ tab: "all", search: "  acme ", today })).toEqual({ q: "acme" });
    expect(listPageInput({ tab: "overdue", search: "INV-1999", today })).toEqual({
      q: "INV-1999",
      status: "overdue",
      today,
    });
    expect(listPageInput({ tab: "paid", search: "   ", today })).toEqual({ status: "paid" });
  });

  it("cuts a search to the server's 100 characters instead of being refused", () => {
    expect(listPageInput({ tab: "all", search: "x".repeat(150), today })).toEqual({ q: "x".repeat(100) });
  });

  it("asks nothing for Waiting or Overdue before the browser's today is known; All and Paid need none", () => {
    expect(listPageInput({ tab: "waiting", search: "", today: null })).toBeUndefined();
    expect(listPageInput({ tab: "overdue", search: "a", today: null })).toBeUndefined();
    expect(listPageInput({ tab: "all", search: "", today: null })).toEqual({});
    expect(listPageInput({ tab: "paid", search: "", today: null })).toEqual({ status: "paid" });
  });
});
