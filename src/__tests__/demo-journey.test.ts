import { compare } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import {
  buildDemoData,
  DEMO_EMAIL_DOMAIN,
  DEMO_PASSWORD_HASH,
  DEMO_PER_IP,
  DEMO_TTL_HOURS,
  daysBefore,
  isDemoEmail,
  MAX_LIVE_DEMOS,
} from "@/lib/demo";
import { DEMO_QUOTAS } from "@/lib/quotas";
import { createDemoUser } from "@/server/demo";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryNonBillableDays } from "./helpers/memory-non-billable";
import { memoryRateLimit } from "./helpers/memory-rate-limit";

const createCaller = createCallerFactory(appRouter);

type User = {
  id: string;
  name: string | null;
  email: string;
  password_hash: string;
  is_demo: boolean;
  token_version: number;
  created_at: Date;
  business_name: string | null;
  ein: string | null;
  address: string | null;
  logo: string | null;
  payment_instructions: string | null;
  email_verified_at: Date | null;
  invoice_branding: boolean;
};
type Row = Record<string, unknown> & { id: string; user_id: string };

/** A small stateful stand-in for the database: enough for the demo to be built and then used. */
function world() {
  const users: User[] = [];
  const clients: (Row & { name: string })[] = [];
  const projects: (Row & { client_id: string; name: string; hourly_rate: number; billable: boolean })[] = [];
  const entries: (Row & { project_id: string; date: string; minutes: number; note: string })[] = [];
  const invoices: (Row & { number: string; paid_date: string | null; total_cents: number; snapshot: string })[] = [];
  const limits = memoryRateLimit();
  let n = 0;
  const id = (p: string) => `${p}${++n}`;

  const prisma = {
    ...memoryNonBillableDays(),
    rateLimit: limits.rateLimit,
    authUser: {
      create: vi.fn(async ({ data }: { data: Partial<User> & { id?: string } }) => {
        const row: User = {
          id: data.id ?? id("u"),
          name: null,
          email: "",
          password_hash: "",
          is_demo: false,
          token_version: 0,
          created_at: new Date(),
          business_name: null,
          ein: null,
          address: null,
          logo: null,
          payment_instructions: null,
          email_verified_at: null,
          invoice_branding: true,
          ...data,
        };
        users.push(row);
        return row;
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id?: string; email?: string } }) =>
          users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const u = users.find((x) => x.id === where.id) as User;
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === "object" && "increment" in v)
            (u as never as Record<string, number>)[k] += (v as { increment: number }).increment;
          else (u as never as Record<string, unknown>)[k] = v;
        }
        return u;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id?: string; is_demo?: boolean; created_at?: { lt: Date } } }) => {
        const gone = users.filter(
          (u) =>
            (where.id ? u.id === where.id : true) &&
            (where.is_demo === undefined || u.is_demo === where.is_demo) &&
            (!where.created_at || u.created_at < where.created_at.lt),
        );
        for (const u of gone) {
          users.splice(users.indexOf(u), 1);
          for (const list of [clients, projects, entries, invoices]) {
            for (let i = list.length - 1; i >= 0; i--) if (list[i].user_id === u.id) list.splice(i, 1);
          }
        }
        return { count: gone.length };
      }),
      count: vi.fn(
        async ({ where }: { where: { is_demo: boolean } }) => users.filter((u) => u.is_demo === where.is_demo).length,
      ),
    },
    client: {
      create: vi.fn(async ({ data }: { data: Omit<Row, "id"> & { name: string } }) => {
        const row = { id: id("c"), ...data } as (typeof clients)[number];
        clients.push(row);
        return row;
      }),
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; user_id: string } }) =>
          clients.find((c) => c.id === where.id && c.user_id === where.user_id) ?? null,
      ),
      count: vi.fn(
        async ({ where }: { where: { user_id: string } }) => clients.filter((c) => c.user_id === where.user_id).length,
      ),
      deleteMany: vi.fn(async ({ where }: { where: { user_id: string } }) => {
        for (let i = clients.length - 1; i >= 0; i--) if (clients[i].user_id === where.user_id) clients.splice(i, 1);
        return { count: 0 };
      }),
    },
    project: {
      findFirst: vi.fn(async (_args?: unknown) => null as unknown),
      create: vi.fn(async ({ data }: { data: never }) => {
        const row = { id: id("p"), ...(data as object) } as (typeof projects)[number];
        projects.push(row);
        return row;
      }),
      count: vi.fn(
        async ({ where }: { where: { user_id: string } }) => projects.filter((p) => p.user_id === where.user_id).length,
      ),
      deleteMany: vi.fn(async ({ where }: { where: { user_id: string } }) => {
        for (let i = projects.length - 1; i >= 0; i--) if (projects[i].user_id === where.user_id) projects.splice(i, 1);
        return { count: 0 };
      }),
    },
    timeEntry: {
      // Marks the entries an invoice bills (migration 0035); answers how many it marked.
      updateMany: vi.fn(async (a?: { where?: { id?: { in?: unknown[] } } }) => ({
        count: a?.where?.id?.in?.length ?? 0,
      })),
      createMany: vi.fn(async ({ data }: { data: never[] }) => {
        for (const d of data) entries.push({ id: id("e"), ...(d as object) } as (typeof entries)[number]);
        return { count: data.length };
      }),
      count: vi.fn(
        async ({ where }: { where: { user_id: string } }) => entries.filter((e) => e.user_id === where.user_id).length,
      ),
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { user_id: string; date: { gte: string; lte: string }; project: { client_id: string } };
        }) =>
          entries
            .filter((e) => e.user_id === where.user_id && e.date >= where.date.gte && e.date <= where.date.lte)
            .map((e) => ({ ...e, started_at: null, project: projects.find((p) => p.id === e.project_id) }))
            .filter((e) => e.project?.client_id === where.project.client_id),
      ),
      deleteMany: vi.fn(async ({ where }: { where: { user_id: string } }) => {
        for (let i = entries.length - 1; i >= 0; i--) if (entries[i].user_id === where.user_id) entries.splice(i, 1);
        return { count: 0 };
      }),
    },
    invoice: {
      findFirst: vi.fn(
        async ({ where }: { where: { user_id: string; number: string } }) =>
          invoices.find((i) => i.user_id === where.user_id && i.number === where.number) ?? null,
      ),
      count: vi.fn(
        async ({ where }: { where: { user_id: string; number?: { startsWith: string } } }) =>
          invoices.filter((i) => i.user_id === where.user_id).length,
      ),
      create: vi.fn(async ({ data }: { data: never }) => {
        const row = { id: id("i"), paid_date: null, ...(data as object) } as (typeof invoices)[number];
        invoices.push(row);
        return { id: row.id };
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id: string; user_id: string }; data: { paid_date: string | null } }) => {
          const inv = invoices.find((i) => i.id === where.id && i.user_id === where.user_id);
          if (inv) inv.paid_date = data.paid_date;
          return { count: inv ? 1 : 0 };
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: { user_id: string } }) => {
        for (let i = invoices.length - 1; i >= 0; i--) if (invoices[i].user_id === where.user_id) invoices.splice(i, 1);
        return { count: 0 };
      }),
    },
  };
  return { prisma, users, clients, projects, entries, invoices, limits };
}

const NOW = new Date("2026-10-16T15:00:00Z");

describe("the sample data", () => {
  it("is a believable five weeks of freelance work that never reaches into the future", () => {
    const d = buildDemoData("2026-10-16");
    expect(d.clients.map((c) => c.name)).toEqual(["Northwind Studio", "Fable Labs", "My own business"]);
    expect(d.projects).toHaveLength(4);
    expect(d.projects.some((p) => !p.billable)).toBe(true);
    expect(d.entries.length).toBeGreaterThan(30);
    expect(d.entries.length).toBeLessThan(120);
    for (const e of d.entries) {
      expect(e.date <= "2026-10-15").toBe(true); // yesterday at the latest, in any time zone
      expect(e.date >= daysBefore("2026-10-16", 36)).toBe(true);
      expect([0, 6]).not.toContain(new Date(`${e.date}T00:00:00Z`).getUTCDay());
      expect(e.minutes).toBeGreaterThan(0);
      expect(e.note.length).toBeGreaterThan(5);
    }
    // one entry per project per day, like most people log it
    const seen = new Set(d.entries.map((e) => `${e.date}|${e.projectKey}`));
    expect(seen.size).toBe(d.entries.length);
  });

  it("is the same for the same day and different on another, and always gives both invoices billable time", () => {
    expect(buildDemoData("2026-10-16")).toEqual(buildDemoData("2026-10-16"));
    expect(buildDemoData("2026-10-16").entries).not.toEqual(buildDemoData("2026-10-23").entries);
    for (const day of ["2026-10-16", "2026-11-03", "2027-01-02", "2026-03-09"]) {
      const d = buildDemoData(day);
      for (const inv of d.invoices) {
        const projectKeys = d.projects.filter((p) => p.clientKey === inv.clientKey && p.billable).map((p) => p.key);
        const minutes = d.entries
          .filter((e) => projectKeys.includes(e.projectKey) && e.date >= inv.from && e.date <= inv.to)
          .reduce((n, e) => n + e.minutes, 0);
        expect(minutes, `${day} ${inv.clientKey}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("a visitor tries the demo", () => {
  it("gets a throwaway account that nobody can sign in to, filled with sample data and two real invoices", async () => {
    const w = world();
    const made = await createDemoUser(w.prisma as never, { ip: "203.0.113.5", now: NOW });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const user = w.users[0];
    expect(user).toMatchObject({ is_demo: true, name: "Demo", password_hash: DEMO_PASSWORD_HASH });
    expect(isDemoEmail(user.email)).toBe(true);
    expect(user.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`)).toBe(true);
    expect(await compare("anything at all", user.password_hash)).toBe(false);

    expect(w.clients).toHaveLength(3);
    expect(w.projects).toHaveLength(4);
    expect(w.entries.length).toBeGreaterThan(30);
    expect([...w.clients, ...w.projects, ...w.entries].every((r) => r.user_id === user.id)).toBe(true);
    expect(w.invoices.map((i) => [i.number, i.paid_date !== null])).toEqual([
      ["INV-2026-001", true],
      ["INV-2026-002", false],
    ]);
    expect(w.invoices.every((i) => i.total_cents > 0)).toBe(true);
    // the sample invoice never carries a demo address as the seller's email
    expect(w.invoices.every((i) => JSON.parse(i.snapshot).seller.email === "you@yourbusiness.example")).toBe(true);
  });

  it("sweeps demos older than a day before making a new one, and never touches real accounts", async () => {
    const w = world();
    const old = new Date(NOW.getTime() - (DEMO_TTL_HOURS + 1) * 3_600_000);
    const fresh = new Date(NOW.getTime() - 3_600_000);
    await w.prisma.authUser.create({
      data: { id: "old-demo", email: "a@x.invalid", is_demo: true, created_at: old } as never,
    });
    await w.prisma.authUser.create({
      data: { id: "new-demo", email: "b@x.invalid", is_demo: true, created_at: fresh } as never,
    });
    await w.prisma.authUser.create({
      data: { id: "member", email: "m@example.com", is_demo: false, created_at: old } as never,
    });
    await w.prisma.client.create({ data: { user_id: "old-demo", name: "Stale" } as never } as never);

    await createDemoUser(w.prisma as never, { now: NOW });
    expect(w.users.map((u) => u.id)).toEqual(expect.arrayContaining(["new-demo", "member"]));
    expect(w.users.map((u) => u.id)).not.toContain("old-demo");
    expect(w.clients.some((c) => c.user_id === "old-demo")).toBe(false); // its data went with it
    expect(w.prisma.authUser.deleteMany).toHaveBeenCalledWith({
      where: { is_demo: true, created_at: { lt: new Date(NOW.getTime() - DEMO_TTL_HOURS * 3_600_000) } },
    });
  });

  it("limits each connection to a few demos an hour, even in a burst, and a different connection is unaffected", async () => {
    const w = world();
    const results = await Promise.all(
      Array.from({ length: DEMO_PER_IP.limit + 3 }, () =>
        createDemoUser(w.prisma as never, { ip: "198.51.100.8", now: NOW }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(DEMO_PER_IP.limit);
    expect(results.filter((r) => !r.ok)).toEqual(Array(3).fill({ ok: false, reason: "rate" }));
    expect(w.users.filter((u) => u.is_demo)).toHaveLength(DEMO_PER_IP.limit);
    expect((await createDemoUser(w.prisma as never, { ip: "198.51.100.9", now: NOW })).ok).toBe(true);
  });

  it("says it is busy rather than piling up demos past the ceiling", async () => {
    const w = world();
    w.prisma.authUser.count.mockResolvedValue(MAX_LIVE_DEMOS as never);
    expect(await createDemoUser(w.prisma as never, { now: NOW })).toEqual({ ok: false, reason: "busy" });
    expect(w.users).toHaveLength(0);
  });

  it("has room for a busy day: the ceiling is thousands, and one below it still makes a demo", async () => {
    expect(MAX_LIVE_DEMOS).toBeGreaterThanOrEqual(3000); // 300 ran out within hours of a busy post
    const w = world();
    w.prisma.authUser.count.mockResolvedValue((MAX_LIVE_DEMOS - 1) as never);
    expect((await createDemoUser(w.prisma as never, { now: NOW })).ok).toBe(true);
  });

  it("leaves nothing half-made behind when seeding fails", async () => {
    const w = world();
    w.prisma.project.create.mockRejectedValueOnce(new Error("database went away"));
    await expect(createDemoUser(w.prisma as never, { now: NOW })).rejects.toThrow("database went away");
    expect(w.users).toHaveLength(0);
    expect(w.clients).toHaveLength(0);
  });
});

describe("inside the demo", () => {
  const demoCaller = (w: ReturnType<typeof world>, userId: string, demo = true) =>
    createCaller({ session: { user: { id: userId, demo }, expires: "" }, prisma: w.prisma as never });

  it("has a much smaller allowance than a member", async () => {
    const w = world();
    const made = await createDemoUser(w.prisma as never, { now: NOW });
    if (!made.ok) throw new Error("demo failed");
    w.prisma.timeEntry.count.mockResolvedValue(DEMO_QUOTAS.entries as never);
    w.prisma.project.findFirst.mockResolvedValue({ id: "p1" });
    await expect(
      demoCaller(w, made.user.id).entry.create({ projectId: "p1", date: "2026-10-15", minutes: 30 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("The demo is limited") });
  });

  it("cannot make AI access tokens or ask for a confirmation email", async () => {
    const w = world();
    const made = await createDemoUser(w.prisma as never, { now: NOW });
    if (!made.ok) throw new Error("demo failed");
    const c = demoCaller(w, made.user.id);
    await expect(c.account.createApiToken({ name: "x", access: "read", expires: "never" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("Create a free account"),
    });
    const withMail = createCaller({
      session: { user: { id: made.user.id, demo: true }, expires: "" },
      prisma: w.prisma as never,
      mailer: { send: vi.fn() },
    });
    await expect(withMail.account.sendVerification()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("turning the demo into a real account", () => {
  async function demo() {
    const w = world();
    const made = await createDemoUser(w.prisma as never, { now: NOW });
    if (!made.ok) throw new Error("demo failed");
    const c = createCaller({
      session: { user: { id: made.user.id, demo: true }, expires: "" },
      prisma: w.prisma as never,
    });
    return { w, c, id: made.user.id };
  }
  const details = { name: "Jo Freelance", email: "Jo@Example.com", password: "a-long-password", startFresh: true };

  it("starting fresh keeps the account but removes the sample data and placeholder business details", async () => {
    const { w, c, id } = await demo();
    await c.account.claimDemo(details);
    const user = w.users.find((u) => u.id === id) as User;
    expect(user).toMatchObject({
      is_demo: false,
      name: "Jo Freelance",
      email: "jo@example.com",
      business_name: null,
      address: null,
      payment_instructions: null,
      token_version: 1, // the old demo sign-in token stops working
    });
    expect(await compare("a-long-password", user.password_hash)).toBe(true);
    expect(w.clients.filter((x) => x.user_id === id)).toHaveLength(0);
    expect(w.entries.filter((x) => x.user_id === id)).toHaveLength(0);
    expect(w.invoices.filter((x) => x.user_id === id)).toHaveLength(0);
  });

  it("keeping the work leaves the time in place but drops the sample invoices", async () => {
    const { w, c, id } = await demo();
    const before = w.entries.length;
    expect(w.invoices.filter((x) => x.user_id === id).length).toBeGreaterThan(0);
    await c.account.claimDemo({ ...details, startFresh: false });
    expect(w.entries.filter((x) => x.user_id === id)).toHaveLength(before);
    // The sample invoices go: their frozen copies carry the sample business details (issue 219). The time stays, unbilled.
    expect(w.invoices.filter((x) => x.user_id === id)).toHaveLength(0);
    expect(w.entries.filter((x) => x.user_id === id && x.invoice_id)).toHaveLength(0);
    expect((w.users.find((u) => u.id === id) as User).is_demo).toBe(false);
  });

  it("refuses an email that is taken, a demo address, a short password, and a full account, changing nothing", async () => {
    const { w, c, id } = await demo();
    await w.prisma.authUser.create({ data: { id: "member", email: "jo@example.com" } as never });
    await expect(c.account.claimDemo(details)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(c.account.claimDemo({ ...details, email: `x@${DEMO_EMAIL_DOMAIN}` })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(c.account.claimDemo({ ...details, email: "new@example.com", password: "short" })).rejects.toThrow();
    expect((w.users.find((u) => u.id === id) as User).is_demo).toBe(true);
    expect(w.entries.some((e) => e.user_id === id)).toBe(true);

    // a real member (database says so, whatever the token says) cannot use this to wipe their data
    const member = createCaller({
      session: { user: { id: "member", demo: true }, expires: "" },
      prisma: w.prisma as never,
    });
    await expect(member.account.claimDemo({ ...details, email: "other@example.com" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(w.prisma.client.deleteMany).not.toHaveBeenCalled();
  });

  it("is only for signed-in demo visitors", async () => {
    const w = world();
    const out = createCaller({ session: null, prisma: w.prisma as never });
    await expect(out.account.claimDemo(details)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
