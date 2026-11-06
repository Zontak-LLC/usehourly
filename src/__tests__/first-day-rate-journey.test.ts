import { describe, expect, it, vi } from "vitest";

import { buildInvoice, type InvoiceEntry } from "@/lib/invoice";
import { RATE_HINT, rateCents } from "@/lib/money";
import { firstRunNames } from "@/lib/quick-start";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { withGuardedInsert } from "./helpers/guarded-insert-mock";

/**
 * Issue 431, snag 2: two first-day testers out of two got a $0 first invoice. The rate is now asked at first run and on
 * Add a project, and the invoice screen sets a missing rate in place through `project.update`.
 */
const createCaller = createCallerFactory(appRouter);

type Project = { id: string; user_id: string; client_id: string; name: string; hourly_rate: number; billable: boolean };

function world(projects: Project[]) {
  const stored = projects.map((p) => ({ ...p }));
  const prisma = {
    client: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async ({ where }: { where: { id?: string; user_id: string } }) =>
        where.id === "acme" && where.user_id === "u1" ? { id: "acme", name: "Acme Studio" } : null,
      ),
      create: vi.fn(async ({ data }: { data: { id: string } }) => ({ ...data })),
    },
    project: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(
        async ({ where }: { where: { id?: string; user_id?: string; client_id?: string; name?: string } }) =>
          stored.find(
            (p) =>
              (where.id === undefined || p.id === where.id) &&
              (where.user_id === undefined || p.user_id === where.user_id) &&
              (where.client_id === undefined || p.client_id === where.client_id) &&
              (where.name === undefined || p.name === where.name),
          ) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Project }) => {
        stored.push({ ...data });
        return data;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = stored.find((p) => p.id === where.id);
        if (!row) throw new Error("no such project");
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string; user_id: string }; data: Partial<Project> }) => {
        const row = stored.find((p) => p.id === where.id && p.user_id === where.user_id);
        if (!row) throw new Error("no such project");
        Object.assign(row, data);
        return row;
      }),
    },
  };
  const as = (id: string) =>
    createCaller({ session: { user: { id }, expires: "" } as never, prisma: withGuardedInsert(prisma) as never });
  return { prisma, as, stored };
}

/** Three hours logged today on a project, priced from what is stored now (as the invoice screen's refetch does). */
const threeHoursOn = (p: Project): InvoiceEntry[] => [
  { date: "2026-11-05", minutes: 120, note: "Logo concepts", started_at: null, project_id: p.id, project: p },
  { date: "2026-11-05", minutes: 60, note: "", started_at: null, project_id: p.id, project: p },
];

const general = (over: Partial<Project> = {}): Project => ({
  id: "general",
  user_id: "u1",
  client_id: "acme",
  name: "General",
  hourly_rate: 0,
  billable: true,
  ...over,
});

describe("a rate box reads a typed rate the same way everywhere", () => {
  it("turns dollars into cents and anything blank or odd into no rate", () => {
    expect(rateCents("60")).toBe(6000);
    expect(rateCents("62.5")).toBe(6250);
    expect(rateCents(" 75 ")).toBe(7500);
    for (const nothing of ["", null, undefined, "abc", "-5", "0"]) expect(rateCents(nothing)).toBe(0);
    expect(RATE_HINT).toBe("Optional. Invoices use it: hours × rate. You can set it later.");
  });
});

describe("first run: the rate goes to the General project", () => {
  it("makes General at $60.00/h when 60 is typed, and at $0 when the rate is left blank", async () => {
    for (const [typed, cents] of [
      ["60", 6000],
      ["", 0],
    ] as const) {
      const { as, stored } = world([]);
      const names = firstRunNames("Acme Studio");
      if (!names) throw new Error("expected names");
      await as("u1").project.create({ clientId: "acme", name: names.project, hourlyRate: rateCents(typed) });
      expect(stored).toEqual([expect.objectContaining({ name: "General", hourly_rate: cents, user_id: "u1" })]);
    }
  });
});

describe("the invoice screen sets a missing rate in place", () => {
  it("names the $0 project with its id, and after Save the 3 hours come to $180.00", async () => {
    const { as, stored } = world([general()]);
    const before = buildInvoice(threeHoursOn(stored[0]));
    expect(before.totalCents).toBe(0);
    expect(before.zeroRateProjects).toEqual([{ id: "general", name: "General" }]);

    // the inline box: "60", Save
    await as("u1").project.update({ id: before.zeroRateProjects[0].id, hourlyRate: rateCents("60") });

    const after = buildInvoice(threeHoursOn(stored[0]));
    expect(after.totalCents).toBe(18_000);
    expect(after.zeroRateProjects).toEqual([]);
    expect(stored[0]).toMatchObject({ name: "General", hourly_rate: 6000, billable: true }); // what Clients shows
  });

  it("refuses another account's project and changes nothing", async () => {
    const { prisma, as, stored } = world([general(), general({ id: "theirs", user_id: "u2", client_id: "other" })]);
    await expect(as("u1").project.update({ id: "theirs", hourlyRate: 6000 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(prisma.project.update).not.toHaveBeenCalled();
    expect(stored.map((p) => p.hourly_rate)).toEqual([0, 0]);
  });
});
