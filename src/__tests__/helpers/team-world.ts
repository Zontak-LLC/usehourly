import { vi } from "vitest";

import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { withGuardedInsert } from "./guarded-insert-mock";
import { memoryRateLimit } from "./memory-rate-limit";

const createCaller = createCallerFactory(appRouter);

export const nowS = () => Math.floor(Date.now() / 1000);

/** One row of the fake database: column name to value. */
export type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

/** Equality, `{ in }`, `{ notIn }`, `{ gt }`, `{ gte, lte }` and `{ OR }`: all the fake database needs to understand. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Where[]).some((w) => matches(row, w));
    const val = row[k];
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const o = v as { in?: unknown[]; notIn?: unknown[]; gt?: number; gte?: string; lte?: string };
      if (o.in) return o.in.includes(val);
      if (o.notIn) return !o.notIn.includes(val);
      if (o.gt !== undefined) return (val as number) > o.gt;
      if (o.gte !== undefined || o.lte !== undefined)
        return (o.gte === undefined || (val as string) >= o.gte) && (o.lte === undefined || (val as string) <= o.lte);
    }
    return val === v;
  });
}

/** Like `matches`, plus the `project: { client_id: { in } }` filter the routers put on time entries. */
function matchesEntry(entry: Row, where: Where): boolean {
  const { project, ...flat } = where as Where & { project?: { client_id: { in: string[] } } };
  if (!matches(entry, flat)) return false;
  if (!project) return true;
  const clientId = PROJECTS.find((p) => p.id === entry.project_id)?.client_id as string;
  return project.client_id.in.includes(clientId);
}

const OLD = new Date("2026-01-01");
const mail = { email_verified_at: OLD, email_bounced_at: null, is_demo: false, created_at: OLD };
export const USERS: Record<string, Row & { name: string; business_name: string | null; email: string }> = {
  ada: { name: "Ada", business_name: "Ada Makes Sites", email: "ada@example.com", ...mail },
  sam: { name: "Sam", business_name: null, email: "sam@example.com", ...mail },
  zed: { name: "Zed", business_name: null, email: "zed@example.com", ...mail },
};
const CLIENTS: Row[] = [
  { id: "acme", user_id: "ada", name: "Acme", color: "#111", hourly_rate: 9999 },
  { id: "beta", user_id: "ada", name: "Beta", color: "#222", hourly_rate: 9999 },
  { id: "zco", user_id: "zed", name: "Zed Co", color: "#333", hourly_rate: 9999 },
];
const PROJECTS: Row[] = [
  { id: "web", user_id: "ada", client_id: "acme", name: "Website", archived: false, hourly_rate: 9999 },
  { id: "old", user_id: "ada", client_id: "acme", name: "Old site", archived: true, hourly_rate: 9999 },
  { id: "app", user_id: "ada", client_id: "beta", name: "App", archived: false, hourly_rate: 9999 },
  { id: "zweb", user_id: "zed", client_id: "zco", name: "Zed site", archived: false, hourly_rate: 9999 },
];

type Grant = { team_member_id: string; client_id: string };

/**
 * A fresh in-memory world: ada, sam and zed, their clients and projects, and `as(userId)` to call the real routers as
 * one of them. Set `grantFails.createMany` or `grantFails.deleteMany` to make that grant write throw once.
 */
export function world() {
  const members: Row[] = [];
  const grants: Grant[] = [];
  const grantFails = { createMany: false, deleteMany: false };
  const failOnce = (call: keyof typeof grantFails) => {
    if (!grantFails[call]) return;
    grantFails[call] = false;
    throw new Error("D1 write failed");
  };
  const entries: Row[] = [
    {
      id: "own1",
      user_id: "ada",
      author_id: null,
      project_id: "web",
      date: "2026-10-19",
      minutes: 60,
      note: "Ada's own",
      started_at: null,
      invoice_id: null,
      created_at: new Date(1),
    },
    {
      id: "other1",
      user_id: "ada",
      author_id: "kim",
      project_id: "web",
      date: "2026-10-19",
      minutes: 45,
      note: "Kim's",
      started_at: null,
      invoice_id: null,
      created_at: new Date(2),
    },
  ];
  const limiter = memoryRateLimit();
  let n = 0;
  // When `barrier.on` is set, a member's "how many teams am I on" count waits until two requests have both read the
  // invitation, so a test can force the race: both checks pass before either one claims.
  const barrier = { on: false, waiting: [] as (() => void)[] };
  const sent: { to: string; subject: string; text: string; replyTo?: string; headers?: Record<string, string> }[] = [];
  const mailer = { on: true, fails: false };
  const suppressed = new Set<string>();
  const withClients = (m: Row) => ({
    ...m,
    clients: grants.filter((g) => g.team_member_id === m.id).map((g) => ({ client_id: g.client_id })),
  });
  const prisma = {
    rateLimit: limiter.rateLimit,
    authUser: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => USERS[where.id] ?? null),
    },
    emailSuppression: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        suppressed.has(where.email) ? where : null,
      ),
    },
    client: {
      count: vi.fn(async ({ where }: { where: Where }) => CLIENTS.filter((c) => matches(c, where)).length),
    },
    project: {
      findFirst: vi.fn(async ({ where }: { where: Where }) => PROJECTS.find((p) => matches(p, where)) ?? null),
    },
    teamMember: {
      count: vi.fn(async ({ where }: { where: Where }) => {
        if (barrier.on && where.member_id !== undefined) {
          await new Promise<void>((resume) => {
            barrier.waiting.push(resume);
            if (barrier.waiting.length === 2) for (const r of barrier.waiting.splice(0)) r();
          });
        }
        return members.filter((m) => matches(m, where)).length;
      }),
      create: vi.fn(async ({ data }: { data: Row & { clients: { create: { client_id: string }[] } } }) => {
        const { clients, ...rest } = data;
        const row = {
          id: `m${++n}`,
          member_id: null,
          accepted_at: null,
          revoked_at: null,
          created_at: new Date(n),
          ...rest,
        };
        members.push(row);
        for (const c of clients.create) grants.push({ team_member_id: row.id, client_id: c.client_id });
        return row;
      }),
      findMany: vi.fn(async ({ where }: { where: Where }) =>
        members
          .filter((m) => matches(m, where))
          .map((m) => ({
            ...withClients(m),
            member: m.member_id ? { name: USERS[m.member_id as string]?.name ?? null } : null,
            owner: USERS[m.owner_id as string],
          }))
          .map((m) => ({
            ...m,
            clients: m.clients.map((c) => {
              const cl = CLIENTS.find((x) => x.id === c.client_id) as Row;
              const projects = PROJECTS.filter((p) => p.client_id === cl.id && !p.archived).map((p) => ({
                id: p.id,
                name: p.name,
              }));
              return { client_id: c.client_id, client: { id: cl.id, name: cl.name, color: cl.color, projects } };
            }),
          })),
      ),
      findFirst: vi.fn(async ({ where }: { where: Where }) => {
        const m = members.find((x) => matches(x, where));
        return m ? withClients(m) : null;
      }),
      findUnique: vi.fn(async ({ where }: { where: { token_hash: string } }) => {
        const m = members.find((x) => x.token_hash === where.token_hash);
        return m ? { ...m } : null; // a copy, as the database returns: a later update must not change what was read
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
        const hit = members.filter((m) => matches(m, where));
        for (const m of hit) Object.assign(m, data);
        return { count: hit.length };
      }),
    },
    teamMemberClient: {
      findMany: vi.fn(async ({ where }: { where: Where; select?: { client_id: true } }) =>
        grants.filter((g) => matches(g, where)).map((g) => ({ client_id: g.client_id })),
      ),
      deleteMany: vi.fn(async ({ where }: { where: Where }) => {
        failOnce("deleteMany");
        const hit = grants.filter((g) => matches(g, where));
        for (const g of hit) grants.splice(grants.indexOf(g), 1);
        return { count: hit.length };
      }),
      createMany: vi.fn(async ({ data }: { data: Grant[] }) => {
        failOnce("createMany");
        grants.push(...data);
        return { count: data.length };
      }),
    },
    timeEntry: {
      count: vi.fn(async ({ where }: { where: Where }) => entries.filter((e) => matches(e, where)).length),
      findFirst: vi.fn(async ({ where }: { where: Where }) => entries.find((e) => matches(e, where)) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `e${++n}`, started_at: null, invoice_id: null, created_at: new Date(100 + n), ...data };
        entries.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: { where: Where }) => {
        return entries
          .filter((e) => matchesEntry(e, where))
          .map((e) => {
            const p = PROJECTS.find((x) => x.id === e.project_id) as Row;
            return {
              ...e,
              project: { name: p.name, client: { name: (CLIENTS.find((c) => c.id === p.client_id) as Row).name } },
            };
          });
      }),
      deleteMany: vi.fn(async ({ where }: { where: Where }) => {
        const hit = entries.filter((e) => matchesEntry(e, where));
        for (const e of hit) entries.splice(entries.indexOf(e), 1);
        return { count: hit.length };
      }),
    },
  };
  const as = (id: string | null, demo = false) =>
    createCaller({
      session: id ? ({ user: { id, ...(demo ? { demo: true } : {}) }, expires: "" } as never) : null,
      prisma: withGuardedInsert(prisma) as never,
      ip: "203.0.113.5",
      mailer: mailer.on
        ? {
            send: async (m: (typeof sent)[number]) => {
              if (mailer.fails) throw new Error("the email service is down");
              sent.push(m);
            },
          }
        : null,
      baseUrl: "https://usehourly.test",
    } as never);
  return { prisma, members, grants, grantFails, entries, as, barrier, sent, mailer, suppressed };
}

/** The input of `member.log` for one entry on project web, 1.5 hours on 2026-10-19, with any field overridden. */
export const log = (extra: {
  teamId: string;
  projectId?: string;
  duration?: string;
  note?: string;
  clientId?: string;
}) => ({
  projectId: "web",
  date: "2026-10-19",
  duration: "1.5",
  ...extra,
});
