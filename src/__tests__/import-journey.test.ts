import { describe, expect, it, vi } from "vitest";

import { readTimeCsv } from "@/lib/import-csv";
import { QUOTAS } from "@/lib/quotas";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { CLOCKIFY_FILE, HARVEST_FILE, TOGGL_FILE } from "./fixtures/import-files";

const createCaller = createCallerFactory(appRouter);

type C = { id: string; user_id: string; name: string; archived: boolean };
type P = {
  id: string;
  user_id: string;
  client_id: string;
  name: string;
  archived: boolean;
  hourly_rate: number;
  billable: boolean;
};
type E = { user_id: string; project_id: string; date: string; minutes: number; note: string };

/** A small stateful stand-in for the database, so a whole import can be run twice and compared. */
function fakeDb(seed: { clients?: C[]; projects?: P[]; entries?: E[] } = {}) {
  const clients: C[] = [...(seed.clients ?? [])];
  const projects: P[] = [...(seed.projects ?? [])];
  const entries: E[] = [...(seed.entries ?? [])];
  let n = 0;
  const maxGroup = { value: 0 };
  const prisma = {
    client: {
      findMany: vi.fn(async ({ where }: { where: { user_id: string } }) =>
        clients.filter((c) => c.user_id === where.user_id),
      ),
      findFirst: vi.fn(
        async ({ where }: { where: { user_id: string; name: string } }) =>
          clients.find((c) => c.user_id === where.user_id && c.name === where.name) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: { user_id: string; name: string } }) => {
        const row = { id: `c${++n}`, archived: false, ...data };
        clients.push(row);
        return row;
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: { user_id: string; id: { in: string[] } }; data: { archived: boolean } }) => {
          for (const c of clients)
            if (c.user_id === where.user_id && where.id.in.includes(c.id)) c.archived = data.archived;
          return { count: where.id.in.length };
        },
      ),
      count: vi.fn(
        async ({ where }: { where: { user_id: string } }) => clients.filter((c) => c.user_id === where.user_id).length,
      ),
    },
    project: {
      findMany: vi.fn(async ({ where }: { where: { user_id: string } }) =>
        projects.filter((p) => p.user_id === where.user_id),
      ),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Omit<P, "id" | "archived"> }) => {
        const row = { id: `p${++n}`, archived: false, ...data };
        projects.push(row);
        return row;
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: { user_id: string; id: { in: string[] } }; data: { archived: boolean } }) => {
          for (const p of projects)
            if (p.user_id === where.user_id && where.id.in.includes(p.id)) p.archived = data.archived;
          return { count: where.id.in.length };
        },
      ),
      count: vi.fn(
        async ({ where }: { where: { user_id: string } }) => projects.filter((p) => p.user_id === where.user_id).length,
      ),
    },
    timeEntry: {
      findMany: vi.fn(async ({ where }: { where: { user_id: string; date: { gte: string; lte: string } } }) =>
        entries.filter((e) => e.user_id === where.user_id && e.date >= where.date.gte && e.date <= where.date.lte),
      ),
      count: vi.fn(
        async ({ where }: { where: { user_id: string } }) => entries.filter((e) => e.user_id === where.user_id).length,
      ),
      createMany: vi.fn(async ({ data }: { data: E[] }) => {
        maxGroup.value = Math.max(maxGroup.value, data.length);
        entries.push(...data);
        return { count: data.length };
      }),
    },
  };
  return { prisma, clients, projects, entries, maxGroup };
}

const as = (prisma: object, userId = "u1") =>
  createCaller({ session: { user: { id: userId }, expires: "" }, prisma: prisma as never });

const TOGGL = [
  '"User","Email","Client","Project","Task","Description","Billable","Start date","Start time","End date","End time","Duration","Tags","Amount (USD)"',
  '"Jo","jo@example.com","Acme","Website","","Hero","Yes","2026-10-01","09:00:00","2026-10-01","10:30:00","01:30:00","",""',
  '"Jo","jo@example.com","acme","website","","Nav","Yes","2026-10-02","09:00:00","2026-10-02","09:45:00","00:45:00","",""',
  '"Jo","jo@example.com","Globex","Support","","Call","No","2026-10-02","15:00:00","2026-10-02","15:30:00","00:30:00","",""',
  '"Jo","jo@example.com","Globex","Support","","Call","No","2026-10-02","16:00:00","2026-10-02","16:30:00","00:30:00","",""',
].join("\n");

const rowsOf = (csv: string) => {
  const r = readTimeCsv(csv);
  if (!r.ok) throw new Error(r.error);
  return r.preview.rows;
};

describe("moving over from Toggl", () => {
  it("creates the clients and projects it needs, matches names in any capitalisation, and stores every entry", async () => {
    const db = fakeDb();
    const res = await as(db.prisma).timeImport.importRows({ rows: rowsOf(TOGGL) });
    expect(res).toEqual({ created: 4, duplicates: 0, clientsCreated: 2, projectsCreated: 2, newest: "2026-10-02" });
    expect(db.clients.map((c) => c.name)).toEqual(["Acme", "Globex"]); // "acme" joined the existing "Acme"
    expect(db.projects.map((p) => [p.name, p.billable])).toEqual([
      ["Website", true],
      ["Support", false], // every row said non-billable
    ]);
    expect(db.entries.map((e) => [e.date, e.minutes, e.note])).toEqual([
      ["2026-10-01", 90, "Hero"],
      ["2026-10-02", 45, "Nav"],
      ["2026-10-02", 30, "Call"],
      ["2026-10-02", 30, "Call"], // two identical rows in one file are both real
    ]);
    expect(db.entries.every((e) => e.user_id === "u1")).toBe(true);
  });

  it("importing the same file again adds nothing", async () => {
    const db = fakeDb();
    const c = as(db.prisma);
    await c.timeImport.importRows({ rows: rowsOf(TOGGL) });
    const again = await c.timeImport.importRows({ rows: rowsOf(TOGGL) });
    expect(again).toEqual({ created: 0, duplicates: 4, clientsCreated: 0, projectsCreated: 0, newest: null });
    expect(db.entries).toHaveLength(4);
    expect(db.clients).toHaveLength(2);
  });

  it("adds only the new entries when a longer export overlaps an earlier one", async () => {
    const db = fakeDb();
    const c = as(db.prisma);
    await c.timeImport.importRows({ rows: rowsOf(TOGGL) });
    const longer = `${TOGGL}\n"Jo","jo@example.com","Acme","Website","","Footer","Yes","2026-10-03","09:00:00","2026-10-03","10:00:00","01:00:00","",""`;
    const res = await c.timeImport.importRows({ rows: rowsOf(longer) });
    expect(res).toMatchObject({ created: 1, duplicates: 4 });
  });

  it("sets a project's rate from the file (the most common one) and restores archived clients and projects that receive time", async () => {
    const db = fakeDb({
      clients: [{ id: "c0", user_id: "u1", name: "Old Client", archived: true }],
      projects: [
        { id: "p0", user_id: "u1", client_id: "c0", name: "Legacy", archived: true, hourly_rate: 5000, billable: true },
      ],
    });
    const csv = [
      "Client,Project,Date,Duration,Billable Rate (USD),Duration (decimal)",
      "Old Client,Legacy,2026-10-01,01:00:00,,1.00",
      "New Co,Retainer,2026-10-01,01:00:00,85.00,1.00",
      "New Co,Retainer,2026-10-02,01:00:00,85.00,1.00",
      "New Co,Retainer,2026-10-03,01:00:00,90.00,1.00",
    ].join("\n");
    await as(db.prisma).timeImport.importRows({ rows: rowsOf(csv) });
    expect(db.clients.find((c) => c.name === "Old Client")?.archived).toBe(false);
    expect(db.projects.find((p) => p.name === "Legacy")?.archived).toBe(false);
    expect(db.projects.find((p) => p.name === "Retainer")?.hourly_rate).toBe(8500);
    expect(db.projects.find((p) => p.name === "Legacy")?.hourly_rate).toBe(5000); // an existing rate is not overwritten
  });

  it("keeps everyone's data apart: another account's client with the same name is never reused", async () => {
    const db = fakeDb({ clients: [{ id: "theirs", user_id: "u2", name: "Acme", archived: false }] });
    await as(db.prisma, "u1").timeImport.importRows({ rows: rowsOf(TOGGL) });
    expect(db.clients.filter((c) => c.user_id === "u1").map((c) => c.name)).toEqual(["Acme", "Globex"]);
    expect(db.entries.some((e) => e.project_id.startsWith("theirs"))).toBe(false);
    expect(db.prisma.client.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: "u1" } }));
    expect(db.prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ user_id: "u1" }) }),
    );
  });
});

describe("safety of the import", () => {
  it("inserts in small groups that fit the database's variable limit", async () => {
    const db = fakeDb();
    const rows = Array.from({ length: 300 }, (_, i) => ({
      client: "Acme",
      project: "Web",
      date: `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      minutes: 30 + i,
      note: `task ${i}`,
    }));
    const res = await as(db.prisma).timeImport.importRows({ rows });
    expect(res.created).toBe(300);
    expect(db.maxGroup.value).toBeLessThanOrEqual(8);
  });

  it("refuses bad rows and oversized calls, and stores nothing", async () => {
    const db = fakeDb();
    const c = as(db.prisma);
    const good = { client: "Acme", project: "Web", date: "2026-10-01", minutes: 30, note: "" };
    await expect(c.timeImport.importRows({ rows: [{ ...good, date: "10/01/2026" }] })).rejects.toThrow();
    await expect(c.timeImport.importRows({ rows: [{ ...good, minutes: 0 }] })).rejects.toThrow();
    await expect(c.timeImport.importRows({ rows: [{ ...good, minutes: 5000 }] })).rejects.toThrow();
    await expect(c.timeImport.importRows({ rows: [{ ...good, note: "x".repeat(2001) }] })).rejects.toThrow();
    await expect(c.timeImport.importRows({ rows: [] })).rejects.toThrow();
    await expect(c.timeImport.importRows({ rows: Array(301).fill(good) })).rejects.toThrow();
    expect(db.prisma.timeEntry.createMany).not.toHaveBeenCalled();
    expect(db.prisma.client.create).not.toHaveBeenCalled();
  });

  it("stops at the account's entry limit instead of filling the database", async () => {
    const db = fakeDb();
    db.prisma.timeEntry.count.mockResolvedValue((QUOTAS.entries - 2) as never);
    const rows = rowsOf(TOGGL); // 4 new entries
    await expect(as(db.prisma).timeImport.importRows({ rows })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.prisma.timeEntry.createMany).not.toHaveBeenCalled();
    // The limit is checked before anything is made, so a refused file leaves no empty clients or projects behind.
    expect(db.prisma.client.create).not.toHaveBeenCalled();
    expect(db.prisma.project.create).not.toHaveBeenCalled();
    expect(db.clients).toHaveLength(0);
    expect(db.projects).toHaveLength(0);
  });

  it("at the entry limit, a file that holds only time already there still goes through (nothing to add)", async () => {
    const db = fakeDb();
    const rows = rowsOf(TOGGL);
    await as(db.prisma).timeImport.importRows({ rows });
    db.prisma.timeEntry.count.mockResolvedValue(QUOTAS.entries as never);
    const again = await as(db.prisma).timeImport.importRows({ rows });
    expect(again).toMatchObject({ created: 0, duplicates: 4, clientsCreated: 0, projectsCreated: 0 });
  });

  it("is for signed-in accounts only", async () => {
    const db = fakeDb();
    const out = createCaller({ session: null, prisma: db.prisma as never });
    await expect(out.timeImport.importRows({ rows: rowsOf(TOGGL) })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(out.timeImport.check({ rows: rowsOf(TOGGL) })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.prisma.client.findMany).not.toHaveBeenCalled();
  });
});

/** Nothing written: the preview's promise. */
const expectNoWrites = (db: ReturnType<typeof fakeDb>) => {
  expect(db.prisma.client.create).not.toHaveBeenCalled();
  expect(db.prisma.project.create).not.toHaveBeenCalled();
  expect(db.prisma.timeEntry.createMany).not.toHaveBeenCalled();
  expect(db.prisma.client.updateMany).not.toHaveBeenCalled();
  expect(db.prisma.project.updateMany).not.toHaveBeenCalled();
};

describe("moving over from Harvest: file, preview, import, import again", () => {
  it("the preview counts what is new without writing, the import stores exactly that, and a second run adds nothing", async () => {
    const db = fakeDb();
    const c = as(db.prisma);
    const rows = rowsOf(HARVEST_FILE);

    const preview = await c.timeImport.check({ rows });
    expect(preview).toEqual({
      entries: 6,
      duplicates: 0,
      newClients: ["harbor & co", "pine labs"],
      newProjects: ["harbor & co\u0000website redesign", "harbor & co\u0000support", "pine labs\u0000audit"],
    });
    expectNoWrites(db);

    const res = await c.timeImport.importRows({ rows });
    expect(res).toEqual({ created: 6, duplicates: 0, clientsCreated: 2, projectsCreated: 3, newest: "2026-09-18" });
    expect(db.projects.map((p) => [p.name, p.hourly_rate, p.billable])).toEqual([
      ["Website redesign", 12000, true],
      ["Support", 0, false],
      ["Audit", 9500, true],
    ]);
    const projectName = (id: string) => db.projects.find((p) => p.id === id)?.name;
    expect(db.entries.map((e) => [projectName(e.project_id), e.date, e.minutes, e.note])).toEqual([
      ["Website redesign", "2026-09-14", 150, "Homepage, hero and nav"],
      ["Website redesign", "2026-09-15", 80, "Contact form\nand spam check"],
      ["Website redesign", "2026-09-16", 45, "Meetings"],
      ["Support", "2026-09-17", 60, 'Monthly report "September"'],
      ["Audit", "2026-09-18", 186, "Accessibility audit, part 1"],
      ["Audit", "2026-09-18", 6, "Quick call"],
    ]);

    expect(await c.timeImport.check({ rows })).toEqual({ entries: 0, duplicates: 6, newClients: [], newProjects: [] });
    expect(await c.timeImport.importRows({ rows })).toEqual({
      created: 0,
      duplicates: 6,
      clientsCreated: 0,
      projectsCreated: 0,
      newest: null,
    });
    expect(db.entries).toHaveLength(6);
  });

  it("never changes a project the account already has, and never matches another account's project", async () => {
    const db = fakeDb({
      clients: [
        { id: "mine", user_id: "u1", name: "harbor & co", archived: false },
        { id: "theirs", user_id: "u2", name: "Pine Labs", archived: false },
      ],
      projects: [
        {
          id: "pw",
          user_id: "u1",
          client_id: "mine",
          name: "Website Redesign",
          archived: false,
          hourly_rate: 9000,
          billable: true,
        },
        {
          id: "pa",
          user_id: "u2",
          client_id: "theirs",
          name: "Audit",
          archived: false,
          hourly_rate: 1,
          billable: true,
        },
      ],
    });
    const c = as(db.prisma, "u1");
    const rows = rowsOf(HARVEST_FILE);
    expect(await c.timeImport.check({ rows })).toMatchObject({
      newClients: ["pine labs"],
      newProjects: ["harbor & co\u0000support", "pine labs\u0000audit"],
    });
    await c.timeImport.importRows({ rows });
    expect(db.projects.find((p) => p.id === "pw")).toMatchObject({ hourly_rate: 9000, name: "Website Redesign" });
    const audit = db.projects.filter((p) => p.name === "Audit");
    expect(audit.map((p) => [p.user_id, p.hourly_rate])).toEqual([
      ["u2", 1],
      ["u1", 9500],
    ]);
    expect(db.entries.filter((e) => e.project_id === "pa")).toEqual([]);
    expect(db.entries.filter((e) => e.project_id === "pw")).toHaveLength(3);
    expect(db.entries.every((e) => e.user_id === "u1")).toBe(true);
  });

  it("the preview refuses a file that would pass the entry limit, before the import is pressed", async () => {
    const db = fakeDb();
    db.prisma.timeEntry.count.mockResolvedValue((QUOTAS.entries - 1) as never);
    await expect(as(db.prisma).timeImport.check({ rows: rowsOf(HARVEST_FILE) })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expectNoWrites(db);
  });
});

describe("moving over from Toggl Track and Clockify files", () => {
  it("Toggl: non-billable projects are made non-billable, the running timer row is not sent", async () => {
    const db = fakeDb();
    const res = await as(db.prisma).timeImport.importRows({ rows: rowsOf(TOGGL_FILE) });
    expect(res).toMatchObject({ created: 4, clientsCreated: 2, projectsCreated: 3, newest: "2026-09-16" });
    expect(db.projects.map((p) => [p.name, p.billable, p.hourly_rate])).toEqual([
      ["Brand refresh", true, 0],
      ["Admin", false, 0],
      ["General", false, 0],
    ]);
    expect(db.entries.map((e) => e.minutes)).toEqual([136, 60, 45, 20]);
  });

  it("Clockify: the answer to the date question decides the stored days; re-importing with the same answer adds nothing", async () => {
    const db = fakeDb();
    const c = as(db.prisma);
    const dmy = readTimeCsv(CLOCKIFY_FILE, { dateOrder: "dmy" });
    if (!dmy.ok) throw new Error(dmy.error);
    await c.timeImport.importRows({ rows: dmy.preview.rows });
    expect(db.entries.map((e) => e.date)).toEqual(["2026-04-03", "2026-05-03", "2026-03-04", "2026-03-04"]);
    expect(db.projects.map((p) => [p.name, p.hourly_rate, p.billable])).toEqual([
      ["Mobile app", 8500, true],
      ["Internal", 0, false],
      ["General", 0, false],
    ]);
    expect(await c.timeImport.check({ rows: dmy.preview.rows })).toMatchObject({ entries: 0, duplicates: 4 });
  });
});
