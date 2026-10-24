import { describe, expect, it } from "vitest";

import { PAGE_SIZE_DESKTOP, PAGE_SIZE_PHONE, paginate } from "@/lib/paginate";

const items = Array.from({ length: 8 }, (_, i) => `INV-${i + 1}`);

describe("paginating a list of invoices", () => {
  it("shows 3 per page on a phone and walks to a short last page", () => {
    expect(PAGE_SIZE_PHONE).toBe(3);
    const first = paginate(items, 1, PAGE_SIZE_PHONE);
    expect(first).toMatchObject({ items: ["INV-1", "INV-2", "INV-3"], page: 1, pages: 3, from: 1, to: 3, total: 8 });
    const last = paginate(items, 3, PAGE_SIZE_PHONE);
    expect(last).toMatchObject({ items: ["INV-7", "INV-8"], page: 3, from: 7, to: 8 });
  });

  it("shows 10 per page on a wide screen, so 8 invoices fit on one page", () => {
    expect(PAGE_SIZE_DESKTOP).toBe(10);
    expect(paginate(items, 1, PAGE_SIZE_DESKTOP)).toMatchObject({ pages: 1, from: 1, to: 8 });
  });

  it("shows everything on one page when there is no page limit (a phone scrolls Week's whole By project list)", () => {
    const rows = Array.from({ length: 18 }, (_, i) => i);
    const all = paginate(rows, 1, Number.POSITIVE_INFINITY);
    expect(all.items).toHaveLength(18);
    expect([all.page, all.pages, all.from, all.to, all.total]).toEqual([1, 1, 1, 18, 18]);
    expect(paginate([], 1, Number.POSITIVE_INFINITY)).toMatchObject({ items: [], pages: 1, from: 0, to: 0 });
  });

  it("moves a page number that no longer exists inside the range (a filter shrank the list)", () => {
    expect(paginate(items, 9, 3).page).toBe(3);
    expect(paginate(items, 0, 3).page).toBe(1);
    expect(paginate(items, Number.NaN, 3).page).toBe(1);
  });

  it("an empty list is one empty page", () => {
    expect(paginate([], 1, 3)).toEqual({ items: [], page: 1, pages: 1, from: 0, to: 0, total: 0 });
  });

  it("never divides by a zero or negative page size", () => {
    expect(paginate(items, 1, 0).items).toHaveLength(1);
    expect(paginate(items, 1, -4).items).toHaveLength(1);
  });
});
