import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PROJECT_NAME,
  DURATION_CHIPS,
  type FirstRunApi,
  firstRunNames,
  pickFirstRunClient,
  saveFirstRun,
} from "@/lib/quick-start";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { withGuardedInsert } from "./helpers/guarded-insert-mock";

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
    prisma: withGuardedInsert(prisma) as never,
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
    // No colour picked: the first client is ocean blue, never the old indigo (2026-10-24, no purple anywhere).
    const id = expect.any(String); // the guarded insert makes the id (server/quota-insert.ts)
    expect(prisma.client.create).toHaveBeenCalledWith({ data: { id, user_id: "u1", name: "Acme", color: "#2563c9" } });

    prisma.client.findFirst.mockResolvedValueOnce({ id: client.id, name: "Acme" } as never);
    prisma.project.findFirst.mockResolvedValueOnce(null as never);
    await c.project.create({ clientId: client.id, name: names.project, hourlyRate: 0 });
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: { id, user_id: "u1", client_id: client.id, name: "General", hourly_rate: 0, billable: true },
    });

    prisma.project.findFirst.mockResolvedValue({ id: "p1" } as never);
    const chip = DURATION_CHIPS[1];
    const entry = await c.entry.create({ projectId: "p1", date: "2026-10-15", minutes: chip.minutes, note: "" });
    expect(prisma.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { id, user_id: "u1", project_id: "p1", date: "2026-10-15", minutes: 60, note: "" },
      }),
    );

    await c.entry.delete({ id: entry.id });
    expect(prisma.timeEntry.deleteMany).toHaveBeenCalledWith({ where: { id: entry.id, user_id: "u1" } });
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

// A first run that half worked (the client saved, its project refused) must not make a second client on the retry.
describe("half-done first run: Add client again reuses the client left without a project", () => {
  const at = (day: number) => new Date(`2026-11-0${day}T10:00:00Z`);

  it("matches by name in any case and spacing, skips clients with projects, picks the oldest, else null", () => {
    const empty = { id: "a", name: "Northwind Bakery", created_at: at(2), projects: [] };
    expect(pickFirstRunClient([empty], "northwind  bakery")).toBe("a");
    expect(pickFirstRunClient([{ ...empty, projects: [{ id: "p" }] }], "Northwind Bakery")).toBeNull();
    const older = { ...empty, id: "b", created_at: at(1) };
    expect(pickFirstRunClient([empty, older], "Northwind Bakery")).toBe("b");
    expect(pickFirstRunClient([empty], "Acme")).toBeNull();
    expect(pickFirstRunClient([], "Northwind Bakery")).toBeNull();
  });

  it("one failed project.create, then a retry: one client and one project", async () => {
    const clients: { id: string; name: string; created_at: Date; projects: { name: string }[] }[] = [];
    let failNext = true;
    const api: FirstRunApi = {
      listClients: async () => clients,
      createClient: async (name) => {
        // The real `clients.create` refuses a name already used, so a second client could only come from a bug here.
        const client = { id: `c${clients.length + 1}`, name, created_at: at(clients.length + 1), projects: [] };
        clients.push(client);
        return client;
      },
      createProject: async ({ clientId, name }) => {
        if (failNext) {
          failNext = false;
          throw new Error("Couldn't save that project.");
        }
        clients.find((c) => c.id === clientId)?.projects.push({ name });
      },
    };
    const names = firstRunNames("Northwind Bakery");
    if (!names) throw new Error("expected names");
    await expect(saveFirstRun(api, names, 0)).rejects.toThrow("Couldn't save that project.");
    await expect(saveFirstRun(api, names, 0)).resolves.toEqual({ clientId: "c1" });
    expect(clients).toHaveLength(1);
    expect(clients[0].projects).toEqual([{ name: DEFAULT_PROJECT_NAME }]);
  });
});
