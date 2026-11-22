import { describe, expect, it, vi } from "vitest";

import { feature } from "@/lib/features";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

/**
 * The Xero/QuickBooks export is hidden in this release (real switches, no mock). Its card is not on the screen, and
 * calling the server directly gets nothing either: the export answers as if it did not exist and reads no invoices.
 */

const createCaller = createCallerFactory(appRouter);
const YEAR = { from: "2026-01-01", to: "2026-12-31" };

function world() {
  const prisma = {
    invoice: { findMany: vi.fn(async () => []), groupBy: vi.fn(async () => []) },
    client: { findMany: vi.fn(async () => []) },
  };
  const as = (id: string | null) =>
    createCaller({
      session: id ? ({ user: { id }, expires: "" } as never) : null,
      prisma: prisma as never,
    });
  return { prisma, as };
}

describe("while the accounting export is hidden", () => {
  it("runs with the release's real switch", () => {
    expect(feature("accountingExport")).toBe(false);
  });

  it("refuses the invoices, as not found, and exports nothing", async () => {
    const { prisma, as } = world();
    await expect(as("u1").accounting.invoices(YEAR)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Not found.",
    });
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });

  it("refuses the list of currencies, as not found, and reads nothing", async () => {
    const { prisma, as } = world();
    await expect(as("u1").accounting.currencies()).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Not found.",
    });
    expect(prisma.invoice.groupBy).not.toHaveBeenCalled();
  });

  it("still asks a signed-out caller to sign in first", async () => {
    const { prisma, as } = world();
    await expect(as(null).accounting.invoices(YEAR)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });
});
