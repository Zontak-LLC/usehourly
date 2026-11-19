import { describe, expect, it } from "vitest";

import { invoiceStatus, latestInvoiceByClient } from "@/app/(main)/dashboard/clients/_components/client-facts";
import { slideKey } from "@/components/slide-to-confirm";
import { orderClients } from "@/lib/client-list";

const inv = (
  client_id: string,
  number: string,
  issue_date: string,
  due_date: string | null,
  paid_date: string | null,
) => ({
  client_id,
  number,
  issue_date,
  due_date,
  paid_date,
});

describe("Clients page: latest invoice line", () => {
  it("keeps each client's most recent invoice by issue date, the first in the list on a tie", () => {
    const list = [
      inv("acme", "INV-2026-004", "2026-10-01", null, null),
      inv("beta", "INV-2026-003", "2026-09-15", null, null),
      inv("acme", "INV-2026-002", "2026-10-01", null, null), // same day, later in a newest-first list
      inv("acme", "INV-2026-001", "2026-08-01", null, "2026-08-20"),
      inv("beta", "INV-2026-005", "2026-10-05", null, null), // out of order: still the latest for beta
    ];
    const latest = latestInvoiceByClient(list);
    expect(latest.get("acme")?.number).toBe("INV-2026-004");
    expect(latest.get("beta")?.number).toBe("INV-2026-005");
    expect(latest.has("cobalt")).toBe(false);
  });

  it("says paid, days late, due, or open, counting days from the browser's today", () => {
    const today = "2026-10-23";
    expect(invoiceStatus(inv("a", "1", "2026-10-01", "2026-10-11", "2026-10-20"), today)).toEqual({
      kind: "paid",
      date: "2026-10-20",
    });
    expect(invoiceStatus(inv("a", "1", "2026-10-01", "2026-10-11", null), today)).toEqual({ kind: "late", days: 12 });
    expect(invoiceStatus(inv("a", "1", "2026-10-01", "2026-10-22", null), today)).toEqual({ kind: "late", days: 1 });
    // due today is not late yet
    expect(invoiceStatus(inv("a", "1", "2026-10-01", today, null), today)).toEqual({ kind: "due", date: today });
    expect(invoiceStatus(inv("a", "1", "2026-10-20", "2026-11-03", null), today)).toEqual({
      kind: "due",
      date: "2026-11-03",
    });
    expect(invoiceStatus(inv("a", "1", "2026-10-20", null, null), today)).toEqual({ kind: "open" });
    // a month boundary
    expect(invoiceStatus(inv("a", "1", "2026-09-01", "2026-09-30", null), "2026-10-02")).toEqual({
      kind: "late",
      days: 2,
    });
  });
});

describe("Clients page: order of the cards", () => {
  const clients = [
    { id: "1", name: "Zed" },
    { id: "2", name: "acme" },
    { id: "3", name: "Beta" },
    { id: "4", name: "Cobalt" },
  ];
  const minutes: Record<string, number> = { "1": 90, "2": 0, "3": 30, "4": 0 };

  it("puts clients with time this month first and the quiet ones after, each group alphabetical", () => {
    const out = orderClients(clients, (c) => minutes[c.id]);
    expect(out.map((r) => [r.client.name, r.quiet])).toEqual([
      ["Beta", false],
      ["Zed", false],
      ["acme", true],
      ["Cobalt", true],
    ]);
  });

  it("treats every client as active until the month's totals arrive", () => {
    const out = orderClients(clients, () => undefined);
    expect(out.every((r) => !r.quiet)).toBe(true);
    expect(out.map((r) => r.client.name)).toEqual(["acme", "Beta", "Cobalt", "Zed"]);
  });
});

describe("Slide to confirm: keys", () => {
  it("arrows step, Home goes back, End goes to the end, and Enter alone does nothing", () => {
    expect(slideKey("ArrowRight", 0)).toBe(10);
    expect(slideKey("ArrowUp", 95)).toBe(100);
    expect(slideKey("ArrowLeft", 5)).toBe(0);
    expect(slideKey("ArrowDown", 50)).toBe(40);
    expect(slideKey("Home", 70)).toBe(0);
    expect(slideKey("End", 0)).toBe(100);
    expect(slideKey("Enter", 0)).toBeNull();
    expect(slideKey(" ", 0)).toBeNull();
  });
});
