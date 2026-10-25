import { createElement } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { InvoiceDocument } from "@/components/invoice-document";
import type { InvoiceSnapshot } from "@/lib/invoice";

const TZ = process.env.TZ;
afterEach(() => {
  if (TZ === undefined) delete process.env.TZ;
  else process.env.TZ = TZ;
});

const snapshot: InvoiceSnapshot = {
  seller: { name: "Ada Makes Sites", ein: null, address: null, email: "ada@example.com", logo: null },
  client: { name: "Acme" },
  number: "INV-2026-001",
  issueDate: "2026-01-01",
  dueDate: "2026-12-31",
  periodFrom: "2026-01-01",
  periodTo: "2026-12-31",
  notes: "",
  includeDetail: false,
  lines: [],
  detail: [],
  totalMinutes: 0,
  totalCents: 0,
};

/** The page's text as a reader sees it (React marks text joins with empty comments). */
const render = (paidDate: string | null, s: InvoiceSnapshot = snapshot) =>
  renderToStaticMarkup(createElement(InvoiceDocument, { s, paidDate })).replace(/<!-- -->/g, "");

describe("the shared invoice shows its dates unchanged in any time zone", () => {
  it("prints Issued and Due at a year edge exactly as before", () => {
    for (const zone of ["America/Los_Angeles", "Pacific/Kiritimati"]) {
      process.env.TZ = zone;
      const html = render(null);
      expect(html, zone).toContain("Issued Jan 1, 2026");
      expect(html, zone).toContain("Due Dec 31, 2026");
      expect(html, zone).toContain("For Jan 1, 2026 – Dec 31, 2026");
    }
  });

  it("prints the paid date the same way", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(render("2026-12-31")).toContain("Paid on Dec 31, 2026. Thank you.");
  });

  it("prints each time-detail row as date · project · duration", () => {
    process.env.TZ = "Pacific/Kiritimati";
    const withDetail: InvoiceSnapshot = {
      ...snapshot,
      includeDetail: true,
      detail: [{ date: "2026-10-25", project: "Website", note: "Homepage", minutes: 90 }],
    };
    expect(render(null, withDetail)).toContain("Oct 25, 2026 · Website · 1:30");
  });
});
