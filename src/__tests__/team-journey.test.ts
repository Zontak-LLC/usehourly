import { beforeAll, describe, expect, it, vi } from "vitest";

import { hashToken } from "@/lib/email-token";
import { accessDecision } from "@/lib/route-access";
import { MAX_TEAM_MEMBERS } from "@/lib/team";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { withGuardedInsert } from "./helpers/guarded-insert-mock";
import { memoryRateLimit } from "./helpers/memory-rate-limit";

const createCaller = createCallerFactory(appRouter);

beforeAll(() => {
  vi.stubEnv("AUTH_SECRET", "test-secret-for-signed-links");
});
const nowS = () => Math.floor(Date.now() / 1000);

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

/** Equality, `{ in }`, `{ gt }`, `{ gte, lte }` and `{ OR }`: all the fake database needs to understand. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Where[]).some((w) => matches(row, w));
    const val = row[k];
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const o = v as { in?: unknown[]; gt?: number; gte?: string; lte?: string };
      if (o.in) return o.in.includes(val);
      if (o.gt !== undefined) return (val as number) > o.gt;
      if (o.gte !== undefined || o.lte !== undefined)
        return (o.gte === undefined || (val as string) >= o.gte) && (o.lte === undefined || (val as string) <= o.lte);
    }
    return val === v;
  });
}

const OLD = new Date("2026-01-01");
const mail = { email_verified_at: OLD, email_bounced_at: null, is_demo: false, created_at: OLD };
const USERS: Record<string, Row & { name: string; business_name: string | null; email: string }> = {
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

function world() {
  const members: Row[] = [];
  const grants: { team_member_id: string; client_id: string }[] = [];
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
      deleteMany: vi.fn(async ({ where }: { where: { team_member_id: string } }) => {
        for (let i = grants.length - 1; i >= 0; i--)
          if (grants[i].team_member_id === where.team_member_id) grants.splice(i, 1);
      }),
      createMany: vi.fn(async ({ data }: { data: { team_member_id: string; client_id: string }[] }) => {
        grants.push(...data);
      }),
    },
    timeEntry: {
      count: vi.fn(async ({ where }: { where: Where }) => entries.filter((e) => matches(e, where)).length),
      findFirst: vi.fn(async ({ where }: { where: Where }) => entries.find((e) => matches(e, where)) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `e${++n}`, started_at: null, created_at: new Date(100 + n), ...data };
        entries.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: { where: Where }) => {
        const ok = (where.project as { client_id: { in: string[] } }).client_id.in;
        const { project: _p, ...flat } = where;
        return entries
          .filter(
            (e) => matches(e, flat) && ok.includes(PROJECTS.find((p) => p.id === e.project_id)?.client_id as string),
          )
          .map((e) => {
            const p = PROJECTS.find((x) => x.id === e.project_id) as Row;
            return {
              ...e,
              project: { name: p.name, client: { name: (CLIENTS.find((c) => c.id === p.client_id) as Row).name } },
            };
          });
      }),
      deleteMany: vi.fn(async ({ where }: { where: Where }) => {
        const hit = entries.filter((e) => matches(e, where));
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
  return { prisma, members, grants, entries, as, barrier, sent, mailer, suppressed };
}

const log = (extra: { teamId: string; projectId?: string; duration?: string; note?: string; clientId?: string }) => ({
  projectId: "web",
  date: "2026-10-19",
  duration: "1.5",
  ...extra,
});

describe("a studio owner invites a person who logs time on chosen clients", () => {
  it("an invitation link works once, and the owner's list never holds the link", async () => {
    const w = world();
    const { id, token } = await w
      .as("ada")
      .team.invite({ email: " Sam@Example.com ", name: "  Sam  ", clientIds: ["acme"] });
    expect(token.length).toBeGreaterThan(30);
    expect(w.members[0]).toMatchObject({ owner_id: "ada", email: "sam@example.com", label: "Sam", member_id: null });
    expect(w.members[0].token_hash).toBe(await hashToken(token)); // only the hash is stored
    expect(JSON.stringify(await w.as("ada").team.list())).not.toContain(token);
    expect((await w.as("ada").team.list())[0]).toMatchObject({
      id,
      email: "sam@example.com",
      label: "Sam",
      status: "pending",
      clientIds: ["acme"],
    });

    expect(await w.as("sam").member.accept({ token })).toMatchObject({ teamId: id, ownerName: "Ada Makes Sites" });
    expect(w.members[0]).toMatchObject({ member_id: "sam", token_hash: null, expires_at: null });
    expect((await w.as("ada").team.list())[0]).toMatchObject({ status: "active", memberName: "Sam" });

    // the same link cannot be used by anyone else, or again
    await expect(w.as("zed").member.accept({ token })).rejects.toThrow(/isn't available/);
    expect(w.members[0].member_id).toBe("sam");
  });

  it("refuses links that are expired, removed, your own, signed-out or too short", async () => {
    const w = world();
    const first = await w.as("ada").team.invite({ email: "a@example.com", name: "A", clientIds: ["acme"] });
    await expect(w.as("ada").member.accept({ token: first.token })).rejects.toThrow(/own team/);
    w.members[0].expires_at = nowS() - 1;
    await expect(w.as("sam").member.accept({ token: first.token })).rejects.toThrow(/isn't available/);

    const second = await w.as("ada").team.invite({ email: "b@example.com", name: "B", clientIds: ["acme"] });
    await w.as("ada").team.remove({ id: second.id });
    await expect(w.as("sam").member.accept({ token: second.token })).rejects.toThrow(/isn't available/);
    await expect(w.as("sam").member.accept({ token: "short" })).rejects.toThrow();
    await expect(w.as(null).member.accept({ token: first.token })).rejects.toThrow(/sign in/i);
    await expect(w.as("sam", true).member.accept({ token: first.token })).rejects.toThrow(/free account/);
    expect(w.members.every((m) => m.member_id === null)).toBe(true);
  });

  it("a member logs time for the owner on a granted client, once, and the owner's books carry it", async () => {
    const w = world();
    const { id, token } = await w.as("ada").team.invite({ email: "sam@example.com", name: "Sam", clientIds: ["acme"] });
    await w.as("sam").member.accept({ token });

    const clientId = "11111111-1111-4111-8111-111111111111";
    const first = await w.as("sam").member.log(log({ teamId: id, clientId, note: "Header" }));
    expect(first).toMatchObject({
      id: clientId,
      user_id: "ada",
      author_id: "sam",
      project_id: "web",
      minutes: 90,
      note: "Header",
    });
    await w.as("sam").member.log(log({ teamId: id, clientId, note: "Header" })); // a retry
    expect(w.entries.filter((e) => e.author_id === "sam")).toHaveLength(1);
    expect(w.prisma.timeEntry.create).toHaveBeenCalledTimes(1);

    // the clientId of someone else's entry is never handed back
    await expect(
      w.as("sam").member.log(log({ teamId: id, clientId: "22222222-2222-4222-8222-222222222222", projectId: "app" })),
    ).rejects.toThrow(/Project not found/);
  });

  it("a member cannot log on a client they were not granted, an archived project, another owner's project, or a bad duration", async () => {
    const w = world();
    const { id, token } = await w.as("ada").team.invite({ email: "sam@example.com", name: "Sam", clientIds: ["acme"] });
    await w.as("sam").member.accept({ token });
    for (const bad of [{ projectId: "app" }, { projectId: "old" }, { projectId: "zweb" }, { projectId: "nope" }]) {
      await expect(w.as("sam").member.log(log({ teamId: id, ...bad }))).rejects.toThrow(/Project not found/);
    }
    await expect(w.as("sam").member.log(log({ teamId: id, duration: "banana" }))).rejects.toThrow(/duration/);
    await expect(w.as("sam").member.log(log({ teamId: id, duration: undefined }))).rejects.toThrow();
    await expect(w.as("sam").member.log(log({ teamId: "not-my-team" }))).rejects.toThrow(/isn't available/);
    await expect(w.as("zed").member.log(log({ teamId: id }))).rejects.toThrow(/isn't available/); // someone else's team id
    expect(w.prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it("a member sees only their own entries and never rates, other clients or other people's time", async () => {
    const w = world();
    const { id, token } = await w.as("ada").team.invite({ email: "sam@example.com", name: "Sam", clientIds: ["acme"] });
    await w.as("sam").member.accept({ token });
    await w.as("sam").member.log(log({ teamId: id, note: "Mine" }));

    const mine = await w.as("sam").member.myEntries({ teamId: id, from: "2026-10-01", to: "2026-10-31" });
    expect(mine.map((e) => [e.note, e.project, e.client, e.minutes])).toEqual([["Mine", "Website", "Acme", 90]]);

    const teams = await w.as("sam").member.teams();
    expect(teams).toEqual([
      {
        id,
        ownerName: "Ada Makes Sites",
        clients: [{ id: "acme", name: "Acme", color: "#111", projects: [{ id: "web", name: "Website" }] }],
      },
    ]);
    expect(JSON.stringify(teams) + JSON.stringify(mine)).not.toMatch(/9999|hourly_rate|Beta|invoice/);

    await expect(w.as("sam").member.myEntries({ teamId: id, from: "2026-12-01", to: "2026-10-01" })).rejects.toThrow();
    expect(await w.as("zed").member.teams()).toEqual([]);
  });

  it("a member may delete only their own entries; the owner's and other members' stay", async () => {
    const w = world();
    const { id, token } = await w.as("ada").team.invite({ email: "sam@example.com", name: "Sam", clientIds: ["acme"] });
    await w.as("sam").member.accept({ token });
    const mine = await w.as("sam").member.log(log({ teamId: id }));
    for (const target of ["own1", "other1", "missing"]) {
      await expect(w.as("sam").member.deleteEntry({ teamId: id, id: target })).rejects.toThrow(/Entry not found/);
    }
    expect(w.entries.map((e) => e.id)).toEqual(expect.arrayContaining(["own1", "other1", mine.id]));
    await w.as("sam").member.deleteEntry({ teamId: id, id: mine.id as string });
    expect(w.entries.some((e) => e.id === mine.id)).toBe(false);
  });

  it("changing the grant takes effect at once, and removing a person cuts them off but keeps their entries", async () => {
    const w = world();
    const { id, token } = await w.as("ada").team.invite({ email: "sam@example.com", name: "Sam", clientIds: ["acme"] });
    await w.as("sam").member.accept({ token });
    await expect(w.as("sam").member.log(log({ teamId: id, projectId: "app" }))).rejects.toThrow(/Project not found/);

    await w.as("ada").team.setClients({ id, clientIds: ["acme", "beta"] });
    await w.as("sam").member.log(log({ teamId: id, projectId: "app" }));
    await w.as("ada").team.setClients({ id, clientIds: ["acme"] });
    await expect(w.as("sam").member.log(log({ teamId: id, projectId: "app" }))).rejects.toThrow(/Project not found/);
    // entries on a client they lost are no longer listed to them
    expect(await w.as("sam").member.myEntries({ teamId: id, from: "2026-10-01", to: "2026-10-31" })).toEqual([]);

    await w.as("sam").member.log(log({ teamId: id }));
    expect(await w.as("ada").team.remove({ id })).toEqual({ removed: 1 });
    expect(await w.as("ada").team.remove({ id })).toEqual({ removed: 0 });
    await expect(w.as("sam").member.log(log({ teamId: id }))).rejects.toThrow(/isn't available/);
    await expect(w.as("sam").member.myEntries({ teamId: id, from: "2026-10-01", to: "2026-10-31" })).rejects.toThrow(
      /isn't available/,
    );
    await expect(w.as("sam").member.deleteEntry({ teamId: id, id: "x" })).rejects.toThrow(/isn't available/);
    expect(w.entries.filter((e) => e.author_id === "sam").length).toBe(2); // still on the owner's books
    expect(await w.as("sam").member.teams()).toEqual([]);
  });

  it("someone leaving a team ends their own access only", async () => {
    const w = world();
    const { id, token } = await w.as("ada").team.invite({ email: "sam@example.com", name: "Sam", clientIds: ["acme"] });
    await w.as("sam").member.accept({ token });
    expect(await w.as("zed").member.leave({ teamId: id })).toEqual({ left: 0 });
    await w.as("sam").member.log(log({ teamId: id }));
    expect(await w.as("sam").member.leave({ teamId: id })).toEqual({ left: 1 });
    await expect(w.as("sam").member.log(log({ teamId: id }))).rejects.toThrow(/isn't available/);
    expect((await w.as("ada").team.list())[0].status).toBe("removed");
  });

  it("only the owner can manage the team: other accounts, other people's clients, empty or odd input", async () => {
    const w = world();
    const { id } = await w.as("ada").team.invite({ email: "sam@example.com", name: "Sam", clientIds: ["acme"] });
    expect(await w.as("zed").team.list()).toEqual([]);
    expect(await w.as("zed").team.remove({ id })).toEqual({ removed: 0 });
    await expect(w.as("zed").team.setClients({ id, clientIds: ["zco"] })).rejects.toThrow(/Person not found/);
    expect(w.members[0].revoked_at).toBeNull();
    expect(w.grants).toEqual([{ team_member_id: id, client_id: "acme" }]);

    const before = w.prisma.teamMember.create.mock.calls.length;
    await expect(w.as("ada").team.invite({ email: "x@example.com", name: "X", clientIds: ["zco"] })).rejects.toThrow(
      /Client not found/,
    );
    await expect(w.as("ada").team.setClients({ id, clientIds: ["acme", "zco"] })).rejects.toThrow(/Client not found/);
    await expect(w.as("ada").team.invite({ email: "x@example.com", name: "X", clientIds: [] })).rejects.toThrow(
      /at least one client/,
    );
    await expect(w.as("ada").team.invite({ email: "not an address", clientIds: ["acme"] })).rejects.toThrow();
    await expect(w.as("ada").team.invite({ email: "ada@example.com", clientIds: ["acme"] })).rejects.toThrow(
      /your own address/,
    );
    await expect(
      w.as("ada", true).team.invite({ email: "x@example.com", name: "X", clientIds: ["acme"] }),
    ).rejects.toThrow(/free account/);
    expect(w.prisma.teamMember.create.mock.calls.length).toBe(before);
    expect(w.grants).toEqual([{ team_member_id: id, client_id: "acme" }]);

    for (const fn of [
      () => w.as(null).team.list(),
      () => w.as(null).member.teams(),
      () => w.as(null).team.remove({ id }),
    ]) {
      await expect(fn()).rejects.toThrow();
    }
  });

  it("two people opening the same link at the same moment: exactly one gets in", async () => {
    const w = world();
    const { token } = await w.as("ada").team.invite({ email: "sam@example.com", name: "Sam", clientIds: ["acme"] });
    w.barrier.on = true;
    const results = await Promise.allSettled([
      w.as("sam").member.accept({ token }),
      w.as("zed").member.accept({ token }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(["sam", "zed"]).toContain(w.members[0].member_id);
    expect(w.members.filter((m) => m.member_id !== null)).toHaveLength(1);
  });

  it("emails the invitation from the owner, with the same link that joins the team", async () => {
    const w = world();
    const res = await w.as("ada").team.invite({ email: " Sam@Example.com ", name: "Sam", clientIds: ["acme"] });
    expect(res.emailed).toBe(true);
    expect(w.sent).toHaveLength(1);
    const mail = w.sent[0];
    expect(mail).toMatchObject({ to: "sam@example.com", replyTo: "ada@example.com" });
    expect(mail.subject).toContain("Ada Makes Sites");
    expect(mail.headers?.["List-Unsubscribe"]).toContain(
      "https://usehourly.test/api/stop-emails?e=sam%40example.com&t=",
    );
    expect(mail.text).toContain("https://usehourly.test/stop-emails?e=sam%40example.com&t=");
    expect(mail.text).not.toMatch(/9999|\$\d/);
    const link = /https:\/\/usehourly\.test\/team\/join\/([\w-]+)/.exec(mail.text);
    expect(link?.[1]).toBe(res.token);
    expect(await w.as("sam").member.accept({ token: link?.[1] ?? "" })).toMatchObject({ ownerName: "Ada Makes Sites" });
  });

  it("the invitation is always made, but nothing is emailed unless every guard passes", async () => {
    const w = world();
    const ada = USERS.ada;
    const saved = { ...ada };
    const cases: [string, () => void, RegExp][] = [
      ["unconfirmed owner", () => Object.assign(ada, { email_verified_at: null }), /Confirm your own email/],
      ["bounced owner", () => Object.assign(ada, { email_bounced_at: new Date() }), /bounced/],
      ["new account", () => Object.assign(ada, { created_at: new Date() }), /first day/],
      ["demo account", () => Object.assign(ada, { is_demo: true }), /free account/],
      [
        "no mailer",
        () => {
          w.mailer.on = false;
        },
        /isn't set up/,
      ],
      ["opted-out address", () => w.suppressed.add("guard@example.com"), /asked not to get emails/],
      [
        "mail service down",
        () => {
          w.mailer.fails = true;
        },
        /Couldn't send/,
      ],
    ];
    try {
      let made = 0;
      for (const [, change, reason] of cases) {
        Object.assign(ada, saved);
        w.mailer.on = true;
        w.mailer.fails = false;
        w.suppressed.delete("guard@example.com");
        change();
        const res = await w.as("ada").team.invite({ email: "guard@example.com", clientIds: ["acme"] });
        expect(res.token.length).toBeGreaterThan(30); // the link is still handed to the owner to send by hand
        expect(res.emailed).toBe(false);
        expect("reason" in res && res.reason).toMatch(reason);
        expect(w.members).toHaveLength(++made);
      }
      expect(w.sent).toHaveLength(0);
    } finally {
      Object.assign(ada, saved);
    }
  });

  it("limits invitation emails per address and per account", async () => {
    const w = world();
    const results = [];
    for (let i = 0; i < 4; i++)
      results.push(await w.as("ada").team.invite({ email: "same@example.com", clientIds: ["acme"] }));
    expect(results.map((r) => r.emailed)).toEqual([true, true, true, false]);
    expect("reason" in results[3] && results[3].reason).toMatch(/already got 3 emails/);

    const w2 = world();
    const many = [];
    for (let i = 0; i < 11; i++)
      many.push(await w2.as("ada").team.invite({ email: `p${i}@example.com`, clientIds: ["acme"] }));
    expect(many.filter((r) => r.emailed)).toHaveLength(10);
    expect("reason" in many[10] && many[10].reason).toMatch(/10 invitations today/);
    expect(w2.sent).toHaveLength(10);
  });

  it("sending again gives a fresh link and turns the old one off; only for people still waiting", async () => {
    const w = world();
    const first = await w.as("ada").team.invite({ email: "sam@example.com", clientIds: ["acme"] });
    const again = await w.as("ada").team.resend({ id: first.id });
    expect(again.token).not.toBe(first.token);
    expect(again.emailed).toBe(true);
    expect(w.sent).toHaveLength(2);
    await expect(w.as("sam").member.accept({ token: first.token })).rejects.toThrow(/isn't available/);
    await expect(w.as("zed").team.resend({ id: first.id })).rejects.toThrow(/isn't waiting/);
    await w.as("sam").member.accept({ token: again.token });
    await expect(w.as("ada").team.resend({ id: first.id })).rejects.toThrow(/isn't waiting/);
    expect(w.sent).toHaveLength(2);
  });

  it("the invitation page is open to everyone, so it can send a signed-out visitor to log in and back", () => {
    expect(accessDecision("/team/join/abcDEF123", false)).toBe("allow");
    expect(accessDecision("/team/join/abcDEF123", true)).toBe("allow");
    expect(accessDecision("/dashboard/team", false)).toBe("to-login");
  });

  it("caps how many people one owner can invite", async () => {
    const w = world();
    for (let i = 0; i < MAX_TEAM_MEMBERS; i++)
      await w.as("ada").team.invite({ email: `p${i}@example.com`, clientIds: ["acme"] });
    await expect(
      w.as("ada").team.invite({ email: "onemore@example.com", name: "One more", clientIds: ["acme"] }),
    ).rejects.toThrow(/Remove someone/);
    expect(w.members).toHaveLength(MAX_TEAM_MEMBERS);
  });
});
