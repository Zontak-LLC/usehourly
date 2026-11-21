import { describe, expect, it } from "vitest";

import { feature } from "@/lib/features";

import { createCaller, world } from "./helpers/expenses-world";

/**
 * Expenses and mileage are hidden in this release (real switches, no mock). Nobody can list, add, change or delete
 * them by calling the server directly: every call answers as if the feature did not exist, before any read or write.
 */

const YEAR = { from: "2026-01-01", to: "2026-12-31" };
const SPEND = { kind: "expense", date: "2026-05-01", category: "office", amountCents: 500 } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "Not found." };

function expectUntouched(w: ReturnType<typeof world>) {
  const p = w.prisma;
  for (const spy of [
    p.expense.findMany,
    p.expense.count,
    p.expense.create,
    p.expense.updateMany,
    p.expense.deleteMany,
    p.client.findFirst,
    p.authUser.findUnique,
  ]) {
    expect(spy).toHaveBeenCalledTimes(0);
  }
  expect(w.rows()).toEqual([]);
}

describe("while expenses are hidden", () => {
  it("runs with the release's real switch", () => {
    expect(feature("expenses")).toBe(false);
  });

  it("refuses to list, as not found, and reads nothing", async () => {
    const w = world();
    const me = w.as("u1");
    await expect(me.expense.list(YEAR)).rejects.toMatchObject(NOT_FOUND);
    await expect(me.expense.listAll({})).rejects.toMatchObject(NOT_FOUND);
    expectUntouched(w);
  });

  it("refuses to add, change or delete, as not found, and writes nothing", async () => {
    const w = world();
    const me = w.as("u1");
    await expect(me.expense.create({ ...SPEND, clientId: "c1" })).rejects.toMatchObject(NOT_FOUND);
    await expect(
      me.expense.create({ kind: "mileage", date: "2026-05-01", distance: 123, unit: "mi", rate: 700 }),
    ).rejects.toMatchObject(NOT_FOUND);
    await expect(me.expense.update({ id: "e1", expense: { ...SPEND, clientId: "c1" } })).rejects.toMatchObject(
      NOT_FOUND,
    );
    await expect(me.expense.delete({ id: "e1" })).rejects.toMatchObject(NOT_FOUND);
    expectUntouched(w);
  });

  it("still asks a signed-out caller to sign in first", async () => {
    const w = world();
    const anon = createCaller({ session: null, prisma: w.prisma as never });
    await expect(anon.expense.list(YEAR)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expectUntouched(w);
  });
});
