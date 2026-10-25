import { describe, expect, it, vi } from "vitest";

import {
  budgetInputValue,
  budgetStatus,
  centsFor,
  describeBudget,
  formatBudgetAmount,
  parseBudgetInput,
  usedAmount,
} from "@/lib/budget";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryNonBillableDays } from "./helpers/memory-non-billable";

const createCaller = createCallerFactory(appRouter);

type ProjectRow = {
  id: string;
  user_id: string;
  client_id: string;
  name: string;
  hourly_rate: number;
  billable: boolean;
  budget_amount: number | null;
  budget_unit: string | null;
  budget_period: string;
};
const project = (over: Partial<ProjectRow> & { id: string }): ProjectRow => ({
  user_id: "u1",
  client_id: "c1",
  name: over.id,
  hourly_rate: 10000, // $100/h
  billable: true,
  budget_amount: null,
  budget_unit: null,
  budget_period: "month",
  ...over,
});
type Entry = { user_id: string; project_id: string; date: string; minutes: number };
const entry = (project_id: string, date: string, minutes: number, user_id = "u1"): Entry => ({
  user_id,
  project_id,
  date,
  minutes,
});

type EntryWhere = {
  user_id: string;
  project_id: { in: string[] };
  date?: { gte?: string; lte?: string; in?: string[] };
};
/** The part of Prisma's where the budgets query uses: the account, the projects and an optional date filter. */
function matches(e: Entry, where: EntryWhere): boolean {
  if (e.user_id !== where.user_id || !where.project_id.in.includes(e.project_id)) return false;
  const d = where.date;
  if (!d) return true;
  if (d.gte !== undefined && e.date < d.gte) return false;
  if (d.lte !== undefined && e.date > d.lte) return false;
  if (d.in !== undefined && !d.in.includes(e.date)) return false;
  return true;
}

function world(projects: ProjectRow[], entries: Entry[], days: { user_id: string; date: string }[] = []) {
  const stored = [...projects];
  const prisma = {
    ...memoryNonBillableDays(days),
    project: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; user_id: string } }) =>
          stored.find((p) => p.id === where.id && p.user_id === where.user_id) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: { user_id: string } }) =>
        stored.filter((p) => p.user_id === where.user_id && p.budget_amount !== null),
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<ProjectRow> }) => {
        const row = stored.find((p) => p.id === where.id);
        if (!row) throw new Error("no such project");
        Object.assign(row, data);
        return row;
      }),
    },
    client: { findFirst: vi.fn() },
    timeEntry: {
      findMany: vi.fn(async ({ where }: { where: EntryWhere }) => entries.filter((e) => matches(e, where))),
      groupBy: vi.fn(async ({ where }: { where: EntryWhere }) => {
        const sums = new Map<string, number>();
        for (const e of entries.filter((x) => matches(x, where)))
          sums.set(e.project_id, (sums.get(e.project_id) ?? 0) + e.minutes);
        return [...sums].map(([project_id, minutes]) => ({ project_id, _sum: { minutes } }));
      }),
    },
  };
  const as = (id: string | null) =>
    createCaller({
      session: id ? ({ user: { id }, expires: "" } as never) : null,
      prisma: prisma as never,
    });
  return { prisma, as, stored };
}

const OCT = { from: "2026-10-01", to: "2026-10-31" };

describe("project budgets", () => {
  it("counts a monthly dollar budget from this month's billable time only, and warns as it fills", async () => {
    const { as } = world(
      [project({ id: "web", budget_amount: 100_000, budget_unit: "dollars", budget_period: "month" })],
      [
        entry("web", "2026-10-02", 300), // 5 h = $500
        entry("web", "2026-10-09", 210), // 3.5 h = $350  -> $850 so far
        entry("web", "2026-09-30", 600), // last month: not counted
        entry("web", "2026-10-20", 120), // a non-billable day: not counted
        entry("web", "2026-10-08", 60, "u2"), // a stranger's hour on the same project id: not counted
      ],
      [{ user_id: "u1", date: "2026-10-20" }],
    );
    const budgets = await as("u1").project.budgets(OCT);
    expect(budgets.web).toMatchObject({
      amount: 100_000,
      used: 85_000,
      unit: "dollars",
      period: "month",
      level: "warn",
    });
    expect(budgets.web.fraction).toBeCloseTo(0.85);
    expect(describeBudget(budgets.web)).toBe("$850 of $1,000 this month · 85%");

    // the previous month shows its own use: 10 h = $1,000, exactly the budget, so it is over
    const sept = await as("u1").project.budgets({ from: "2026-09-01", to: "2026-09-30" });
    expect(sept.web).toMatchObject({ used: 100_000, level: "over" });
  });

  it("counts a total budget across every month, and an hours budget in hours even on a non-billable project", async () => {
    const { as } = world(
      [
        project({ id: "site", budget_amount: 20 * 60, budget_unit: "hours", budget_period: "total" }),
        project({ id: "admin", billable: false, budget_amount: 50_000, budget_unit: "dollars" }),
        project({ id: "free", billable: false, budget_amount: 600, budget_unit: "hours" }),
        project({ id: "none" }), // no budget: never reported
      ],
      [
        entry("site", "2026-08-03", 600),
        entry("site", "2026-10-03", 420), // 17 h in all over two months
        entry("admin", "2026-10-04", 480), // dollars on a non-billable project: costs nothing
        entry("free", "2026-10-05", 300), // hours on a non-billable project: 5 h are still 5 h
        entry("none", "2026-10-05", 999),
      ],
    );
    const b = await as("u1").project.budgets(OCT);
    expect(Object.keys(b).sort()).toEqual(["admin", "free", "site"]);
    expect(b.site).toMatchObject({ used: 1020, amount: 1200, level: "warn", period: "total" });
    expect(describeBudget(b.site)).toBe("17:00 h of 20:00 h · 85%");
    expect(b.admin).toMatchObject({ used: 0, level: "ok" });
    expect(b.free).toMatchObject({ used: 300, amount: 600, level: "ok" });
  });

  it("sets, changes and removes a budget on the caller's own project", async () => {
    const { prisma, as, stored } = world([project({ id: "web" })], []);
    const jo = as("u1");

    await jo.project.update({ id: "web", budgetAmount: 100_000, budgetUnit: "dollars", budgetPeriod: "month" });
    expect(stored[0]).toMatchObject({ budget_amount: 100_000, budget_unit: "dollars", budget_period: "month" });
    expect(prisma.project.update.mock.calls[0][0]).toMatchObject({ where: { id: "web", user_id: "u1" } });

    await jo.project.update({ id: "web", budgetAmount: 1500, budgetUnit: "hours", budgetPeriod: "total" });
    expect(stored[0]).toMatchObject({ budget_amount: 1500, budget_unit: "hours", budget_period: "total" });

    // leaving the budget fields out changes nothing about it
    await jo.project.update({ id: "web", name: "Renamed" });
    expect(stored[0]).toMatchObject({ budget_amount: 1500, budget_unit: "hours" });

    await jo.project.update({ id: "web", budgetAmount: null });
    expect(stored[0]).toMatchObject({ budget_amount: null, budget_unit: null });
    expect(await jo.project.budgets(OCT)).toEqual({});
  });

  it("refuses a budget without a unit, a zero, negative, fractional or absurd amount, and writes nothing", async () => {
    const { prisma, as } = world([project({ id: "web" })], []);
    const jo = as("u1");
    for (const bad of [
      { budgetAmount: 5000 }, // no unit
      { budgetAmount: 0, budgetUnit: "dollars" },
      { budgetAmount: -100, budgetUnit: "dollars" },
      { budgetAmount: 12.5, budgetUnit: "hours" },
      { budgetAmount: 100_000_001, budgetUnit: "dollars" },
      { budgetAmount: 5000, budgetUnit: "euros" },
      { budgetAmount: 5000, budgetUnit: "hours", budgetPeriod: "weekly" },
    ]) {
      await expect(jo.project.update({ id: "web", ...bad } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it("never lets one account set or read another's budgets, and refuses signed-out callers", async () => {
    const { prisma, as } = world(
      [project({ id: "mine", budget_amount: 1000, budget_unit: "dollars" }), project({ id: "theirs", user_id: "u2" })],
      [entry("mine", "2026-10-02", 60), entry("theirs", "2026-10-02", 60, "u2")],
    );
    await expect(
      as("u1").project.update({ id: "theirs", budgetAmount: 1000, budgetUnit: "dollars" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.project.update).not.toHaveBeenCalled();

    expect(Object.keys(await as("u1").project.budgets(OCT))).toEqual(["mine"]);
    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ user_id: "u1" }) }),
    );
    expect(await as("u2").project.budgets(OCT)).toEqual({});

    await expect(as(null).project.budgets(OCT)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(as(null).project.update({ id: "mine", budgetAmount: 1, budgetUnit: "hours" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(as("u1").project.budgets({ from: "2026-13-01", to: OCT.to })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("budgets read as little as possible", () => {
  const total = (id = "site") => project({ id, budget_amount: 20 * 60, budget_unit: "hours", budget_period: "total" });

  it("never loads the whole history: a whole-project budget is one SUM plus the few entries on non-billable days", async () => {
    const entries = Array.from({ length: 400 }, (_, i) =>
      entry("site", `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`, 30),
    );
    entries.push(entry("site", "2026-10-20", 120)); // the day marked non-billable below
    const { prisma, as } = world([total()], entries, [{ user_id: "u1", date: "2026-10-20" }]);
    const budgets = await as("u1").project.budgets(OCT);
    expect(budgets.site.used).toBe(400 * 30); // the 120 minutes on the non-billable day are taken back out
    expect(prisma.timeEntry.groupBy).toHaveBeenCalledTimes(1);
    // every entry read is bounded by a date filter, so the account's whole history is never fetched
    for (const [arg] of prisma.timeEntry.findMany.mock.calls) expect(arg.where.date).toBeDefined();
  });

  it("keeps every query under D1's 100 bound values, however many days are marked non-billable", async () => {
    const days = Array.from({ length: 250 }, (_, i) => {
      const d = new Date(Date.UTC(2025, 0, 1 + i));
      return { user_id: "u1", date: d.toISOString().slice(0, 10) };
    });
    const entries = [
      entry("site", days[0].date, 60),
      entry("site", days[249].date, 60),
      entry("site", "2026-10-02", 90),
    ];
    const { prisma, as } = world([total()], entries, days);
    const budgets = await as("u1").project.budgets(OCT);
    expect(budgets.site.used).toBe(90); // only the entry on an ordinary day counts
    expect(prisma.timeEntry.findMany.mock.calls.length).toBeGreaterThan(1); // the days went in groups
    for (const [arg] of prisma.timeEntry.findMany.mock.calls) {
      const values = 1 + arg.where.project_id.in.length + (arg.where.date?.in?.length ?? 0);
      expect(values).toBeLessThanOrEqual(100);
    }
  });
});

describe("budget rules", () => {
  it("turns a share of the budget into ok, warn or over at exactly 80% and 100%", () => {
    const at = (used: number) => budgetStatus({ amount: 1000, used, unit: "dollars", period: "month" });
    expect(at(0).level).toBe("ok");
    expect(at(799).level).toBe("ok");
    expect(at(800).level).toBe("warn");
    expect(at(999).level).toBe("warn");
    expect(at(1000).level).toBe("over");
    expect(at(1250)).toMatchObject({ level: "over", fraction: 1.25 });
  });

  it("prices time at the hourly rate, rounding once on the total", () => {
    expect(centsFor(90, 10000)).toBe(15000);
    expect(centsFor(1, 3333)).toBe(56); // 55.55 -> 56
    expect(usedAmount(90, 10000, "dollars")).toBe(15000);
    expect(usedAmount(90, 10000, "hours")).toBe(90);
    expect(usedAmount(90, 0, "dollars")).toBe(0);
  });

  it("reads what was typed: dollars to cents, hours to minutes, blank to none, junk to nothing", () => {
    expect(parseBudgetInput("1000", "dollars")).toBe(100_000);
    expect(parseBudgetInput("1,000.50", "dollars")).toBe(100_050);
    expect(parseBudgetInput(" 22.5 ", "hours")).toBe(1350);
    expect(parseBudgetInput("", "hours")).toBeNull();
    expect(parseBudgetInput("   ", "dollars")).toBeNull();
    for (const junk of ["abc", "0", "0.001", "-5", "1e3", "5 hours", "1.2.3", "9999999999"]) {
      expect(parseBudgetInput(junk, "dollars")).toBeUndefined();
    }
    expect(budgetInputValue(100_050, "dollars")).toBe("1000.5");
    expect(budgetInputValue(1350, "hours")).toBe("22.5");
  });

  it("shows money and time the way the rest of the app does", () => {
    expect(formatBudgetAmount(100_000, "dollars")).toBe("$1,000");
    expect(formatBudgetAmount(12_345, "dollars")).toBe("$123.45");
    expect(formatBudgetAmount(64_000, "dollars")).toBe("$640");
    expect(formatBudgetAmount(1_250, "dollars")).toBe("$12.50");
    expect(formatBudgetAmount(100_000, "dollars", "EUR")).toBe("€1,000");
    expect(describeBudget(budgetStatus({ amount: 100_000, used: 64_000, unit: "dollars", period: "month" }))).toBe(
      "$640 of $1,000 this month · 64%",
    );
    expect(formatBudgetAmount(1350, "hours")).toBe("22:30 h");
    expect(describeBudget(budgetStatus({ amount: 1200, used: 1500, unit: "hours", period: "total" }))).toBe(
      "25:00 h of 20:00 h · 125%",
    );
  });
});
