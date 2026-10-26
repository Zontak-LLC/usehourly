import { describe, expect, it } from "vitest";

import { buildAnnualReport } from "@/lib/annual-report";
import { formatMoney } from "@/lib/money";
import { yearSectionFacts, yearSectionFromHash, yearSections } from "@/lib/year-sections";

const money = (c: number) => formatMoney(c, "USD");

/** A small year: two clients, three projects, three invoices (one paid in the year, one unpaid, one paid later). */
const report = buildAnnualReport({
  year: 2026,
  projects: [
    { id: "p1", name: "Site", hourly_rate: 10000, billable: true, client_id: "c1", client_name: "Acme" },
    { id: "p2", name: "Care", hourly_rate: 5000, billable: true, client_id: "c1", client_name: "Acme" },
    { id: "p3", name: "Own", hourly_rate: 0, billable: false, client_id: "c2", client_name: "Me" },
  ],
  entries: [
    { date: "2026-02-03", minutes: 120, project_id: "p1" },
    { date: "2026-08-04", minutes: 300, project_id: "p1" },
    { date: "2026-08-05", minutes: 60, project_id: "p2" },
    { date: "2026-09-01", minutes: 90, project_id: "p3" },
    { date: "2025-12-31", minutes: 999, project_id: "p1" }, // another year: never counted
  ],
  invoices: [
    {
      number: "INV-1",
      client_name: "Acme",
      issue_date: "2026-02-28",
      paid_date: "2026-03-10",
      total_cents: 20000,
      total_minutes: 120,
    },
    {
      number: "INV-2",
      client_name: "Acme",
      issue_date: "2026-08-31",
      paid_date: null,
      total_cents: 55000,
      total_minutes: 360,
    },
  ],
});

describe("Year summary split view: the sections and their list lines", () => {
  it("opens the section the address names; Expenses only while its switch is on", () => {
    expect(yearSectionFromHash("#clients", false)).toBe("clients");
    expect(yearSectionFromHash("months", false)).toBe("months");
    expect(yearSectionFromHash("", false)).toBeNull();
    expect(yearSectionFromHash("#toString", false)).toBeNull();
    expect(yearSectionFromHash("#expenses", false)).toBeNull();
    expect(yearSectionFromHash("#expenses", true)).toBe("expenses");
    expect(yearSections(false).map((s) => s.id)).toEqual([
      "year",
      "quarters",
      "months",
      "clients",
      "invoices",
      "payments",
    ]);
    expect(yearSections(true).at(-1)?.id).toBe("expenses");
  });

  it("writes each row's line and figure from the year's own numbers", () => {
    const f = yearSectionFacts(report, money, { count: 2, totalCents: 4900 });
    expect(f.year).toEqual({ line: "$550.00 unpaid", figure: "$200.00", figureLabel: "received" });
    expect(f.quarters).toEqual({
      line: "Busiest: Q3",
      figure: money(report.totals.earnedCents),
      figureLabel: "earned",
    });
    expect(report.totals.earnedCents).toBe(75000); // 7 h × $100 + 1 h × $50 (the non-billable project earns nothing)
    expect(f.months).toEqual({ line: "4 months active", figure: "9:30", figureLabel: "worked" }); // Feb, Aug, Sep, and March for its payment
    expect(f.clients).toEqual({ line: "2 clients · 3 projects", figure: "9:30", figureLabel: "worked" });
    expect(f.invoices).toEqual({ line: "2 · 1 unpaid", figure: "$750.00", figureLabel: "invoiced" });
    expect(f.payments).toEqual({ line: "1 payment", figure: "$200.00", figureLabel: "received" });
    expect(f.expenses).toEqual({ line: "2 expenses", figure: "$49.00", figureLabel: "spent" });
  });

  it("says so plainly when the year is empty", () => {
    const empty = buildAnnualReport({ year: 2024, projects: [], entries: [], invoices: [] });
    const f = yearSectionFacts(empty, money);
    expect(f.quarters.line).toBe("No time logged");
    expect(f.months.line).toBe("No activity");
    expect(f.invoices.line).toBe("None in 2024");
    expect(f.payments.line).toBe("None in 2024");
    expect(f.expenses).toEqual({ line: "None yet", figure: "$0.00", figureLabel: "spent" });
  });
});
