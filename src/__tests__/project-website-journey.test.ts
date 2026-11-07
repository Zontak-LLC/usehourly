import { describe, expect, it, vi } from "vitest";

import { WEBSITE_ERROR } from "@/lib/web-address";
import { QUOTA_TABLES } from "@/server/quota-insert";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { migratedDb } from "./helpers/fake-d1";
import { withGuardedInsert } from "./helpers/guarded-insert-mock";

/**
 * A project's website (2026-11-06, migration 0041): the owner saves "magsmith.com" on a project and the Clients page
 * (clients.list) hands back the full address the row links to. The server checks the address itself (the browser's
 * check can be skipped), and only the project's owner can change it.
 */
const createCaller = createCallerFactory(appRouter);

type Project = {
  id: string;
  user_id: string;
  client_id: string;
  name: string;
  hourly_rate: number;
  billable: boolean;
  archived: boolean;
  website: string | null;
};
type Where = { id?: string; user_id?: string; client_id?: string; name?: string; NOT?: { id: string } };

const matches = (p: Project, w: Where) =>
  (w.id === undefined || p.id === w.id) &&
  (w.user_id === undefined || p.user_id === w.user_id) &&
  (w.client_id === undefined || p.client_id === w.client_id) &&
  (w.name === undefined || p.name === w.name) &&
  (w.NOT === undefined || p.id !== w.NOT.id);

function world() {
  const clients = [
    { id: "acme", user_id: "u1", name: "Acme", color: "#2563c9", archived: false },
    { id: "theirs", user_id: "u2", name: "Theirs", color: "#2563c9", archived: false },
  ];
  const stored: Project[] = [
    {
      id: "mag",
      user_id: "u1",
      client_id: "acme",
      name: "MAGSMITH",
      hourly_rate: 0,
      billable: true,
      archived: false,
      website: null,
    },
  ];
  const prisma = {
    client: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; user_id: string } }) =>
          clients.find((c) => c.id === where.id && c.user_id === where.user_id) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: { user_id: string } }) =>
        clients
          .filter((c) => c.user_id === where.user_id && !c.archived)
          .map((c) => ({ ...c, projects: stored.filter((p) => p.client_id === c.id && !p.archived) })),
      ),
    },
    project: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async ({ where }: { where: Where }) => stored.find((p) => matches(p, where)) ?? null),
      create: vi.fn(async ({ data }: { data: Partial<Project> & { id: string } }) => {
        const row = { archived: false, website: null, ...data } as Project;
        stored.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: Where; data: Partial<Project> }) => {
        const row = stored.find((p) => matches(p, where));
        if (!row) throw new Error("no such project");
        Object.assign(row, data);
        return row;
      }),
    },
  };
  const as = (id: string) =>
    createCaller({ session: { user: { id }, expires: "" } as never, prisma: withGuardedInsert(prisma) as never });
  const listed = async (id: string) =>
    (await as("u1").clients.list()).flatMap((c) => c.projects).find((p) => p.id === id);
  return { as, stored, listed, prisma };
}

describe("a project's website", () => {
  it("is saved from a bare address and comes back full on the Clients page", async () => {
    const { as, listed } = world();
    await as("u1").project.update({ id: "mag", website: "magsmith.com" });
    expect((await listed("mag"))?.website).toBe("https://magsmith.com/");
  });

  it("refuses something that is not a web address and keeps what was stored", async () => {
    const { as, stored, prisma } = world();
    await as("u1").project.update({ id: "mag", website: "magsmith.com" });
    prisma.project.update.mockClear();
    for (const bad of ["not a site", "javascript:alert(1)"]) {
      await expect(as("u1").project.update({ id: "mag", website: bad })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: WEBSITE_ERROR,
      });
    }
    expect(prisma.project.update).not.toHaveBeenCalled();
    expect(stored[0].website).toBe("https://magsmith.com/");
  });

  it("is removed by an empty box, and left alone when the update does not name it", async () => {
    const { as, stored } = world();
    await as("u1").project.update({ id: "mag", website: "magsmith.com" });
    await as("u1").project.update({ id: "mag", hourlyRate: 9000 });
    expect(stored[0]).toMatchObject({ hourly_rate: 9000, website: "https://magsmith.com/" });
    await as("u1").project.update({ id: "mag", website: "" });
    expect(stored[0].website).toBeNull();
    await as("u1").project.update({ id: "mag", website: "https://magsmith.com" });
    await as("u1").project.update({ id: "mag", website: null });
    expect(stored[0].website).toBeNull();
  });

  it("is stored when a project is made with one, and a bad one makes no project", async () => {
    const { as, listed, stored } = world();
    const made = await as("u1").project.create({ clientId: "acme", name: "Shop", website: "example.org" });
    expect((await listed(made.id))?.website).toBe("https://example.org/");
    await expect(
      as("u1").project.create({ clientId: "acme", name: "Bad", website: "ftp://x.com" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: WEBSITE_ERROR });
    expect(stored.map((p) => p.name)).toEqual(["MAGSMITH", "Shop"]);
    const plain = await as("u1").project.create({ clientId: "acme", name: "Plain" });
    expect((await listed(plain.id))?.website).toBeNull();
  });

  it("cannot be changed by another account", async () => {
    const { as, stored } = world();
    await as("u1").project.update({ id: "mag", website: "magsmith.com" });
    await expect(as("u2").project.update({ id: "mag", website: "evil.example.com" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(as("u2").project.update({ id: "mag", website: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(stored[0].website).toBe("https://magsmith.com/");
  });
});

describe("migration 0041", () => {
  it("adds a nullable projects.website that the guarded insert may write", () => {
    const db = migratedDb();
    const cols = db.prepare("PRAGMA table_info(projects)").all() as {
      name: string;
      notnull: number;
      dflt_value: unknown;
    }[];
    expect(cols.find((c) => c.name === "website")).toMatchObject({ notnull: 0, dflt_value: null });
    expect(QUOTA_TABLES.projects).toContain("website");
  });
});
