import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PROJECT_NAME, DURATION_CHIPS, firstRunNames } from "@/lib/quick-start";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

function mockPrisma() {
  return {
    client: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => ({ id: "c1", ...data })),
    },
    project: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(),
      create: vi.fn(async ({ data }) => ({ id: "p1", ...data })),
    },
    timeEntry: {
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }) => ({ id: "e1", ...data })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}
type P = ReturnType<typeof mockPrisma>;
const asCaller = (prisma: P, userId: string | null) =>
  createCaller({
    session: userId ? { user: { id: userId }, expires: "" } : null,
    prisma: prisma as never,
  });

describe("brand-new user: one question, then one tap logs time", () => {
  let prisma: P;
  beforeEach(() => {
    prisma = mockPrisma();
  });

  it("turns a blank answer into nothing and a name into client + default project", () => {
    expect(firstRunNames("   ")).toBeNull();
    expect(firstRunNames("  Acme   Corp ")).toEqual({ client: "Acme Corp", project: DEFAULT_PROJECT_NAME });
  });

  it("offers the five one-tap durations in minutes", () => {
    expect(DURATION_CHIPS.map((c) => c.minutes)).toEqual([30, 60, 120]);
  });

  it("creates the client and a default project, then a chip logs 1 hour and Undo removes it", async () => {
    const c = asCaller(prisma, "u1");
    const names = firstRunNames("Acme");
    if (!names) throw new Error("expected names");

    const client = await c.clients.create({ name: names.client });
    expect(prisma.client.create).toHaveBeenCalledWith({ data: { user_id: "u1", name: "Acme" } });

    prisma.client.findFirst.mockResolvedValueOnce({ id: client.id, name: "Acme" } as never);
    prisma.project.findFirst.mockResolvedValueOnce(null as never);
    await c.project.create({ clientId: client.id, name: names.project, hourlyRate: 0 });
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: { user_id: "u1", client_id: "c1", name: "General", hourly_rate: 0, billable: true },
    });

    prisma.project.findFirst.mockResolvedValue({ id: "p1" } as never);
    const chip = DURATION_CHIPS[1];
    const entry = await c.entry.create({ projectId: "p1", date: "2026-10-15", minutes: chip.minutes, note: "" });
    expect(prisma.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { user_id: "u1", project_id: "p1", date: "2026-10-15", minutes: 60, note: "" } }),
    );

    await c.entry.delete({ id: entry.id });
    expect(prisma.timeEntry.deleteMany).toHaveBeenCalledWith({ where: { id: "e1", user_id: "u1" } });
  });

  it("refuses the first-run steps when signed out and never touches the database", async () => {
    const c = asCaller(prisma, null);
    await expect(c.clients.create({ name: "Acme" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(c.project.create({ clientId: "c1", name: "General", hourlyRate: 0 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it("rejects an empty client name and does not create anything", async () => {
    await expect(asCaller(prisma, "u1").clients.create({ name: "   " })).rejects.toThrow();
    expect(prisma.client.create).not.toHaveBeenCalled();
  });
});
