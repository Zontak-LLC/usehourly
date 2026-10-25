import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { MAX_TOKENS_PER_USER } from "@/lib/api-token";
import { pkceChallenge } from "@/lib/oauth";
import { DEFAULT_CLIENT_COLOR } from "@/lib/palette";
import { DEMO_QUOTAS, QUOTAS } from "@/lib/quotas";
import { decideAuthorization, exchangeCode, registerClient } from "@/server/oauth";
import { accountQuota, insertWithinQuota, QUOTA_TABLES } from "@/server/quota-insert";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { fakeD1 } from "./helpers/fake-d1";

/**
 * Issue 329 (part of #30): the limits on clients, projects, entries and API tokens used to count rows and then insert,
 * so two creates sent at the same moment could both pass the count and take the account one over. Now the count and
 * the insert are one statement (server/quota-insert.ts). These run the REAL procedures on the REAL Prisma client and D1
 * adapter over a migrated SQLite whose every query takes a round trip, so two calls fired together interleave exactly
 * as they would on D1. A mock cannot prove this: it passes with or without the guard.
 */

const createCaller = createCallerFactory(appRouter);
const OWNER = "u1";
const MEMBER = "m1";
const OLD = "2026-01-01T00:00:00.000+00:00";

function world() {
  const { db, DB } = fakeD1();
  const prisma = new PrismaClient({ adapter: new PrismaD1(DB as never) });
  db.exec(
    `INSERT INTO auth_users (id, name, email, password_hash) VALUES ('${OWNER}', 'Owner', 'o@x.invalid', 'x'), ('${MEMBER}', 'Member', 'm@x.invalid', 'x');
     INSERT INTO clients (id, user_id, name, created_at) VALUES ('c0', '${OWNER}', 'Acme', '${OLD}');
     INSERT INTO projects (id, user_id, client_id, name, created_at) VALUES ('p0', '${OWNER}', 'c0', 'Site', '${OLD}');`,
  );
  const as = (id: string, demo = false) =>
    createCaller({ session: { user: { id, demo }, expires: "" } as never, prisma });
  const count = (table: keyof typeof QUOTA_TABLES, where = `user_id = '${OWNER}'`) =>
    Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number }).n);
  /** Adds rows straight into SQLite until the account holds `total` of them (the starting client/project included). */
  const fill = (table: "clients" | "projects" | "time_entries" | "api_tokens", total: number) => {
    const add = total - count(table);
    if (add <= 0) return;
    const select = {
      clients: `'cx' || i, '${OWNER}', 'Client ' || i, '${OLD}'`,
      projects: `'px' || i, '${OWNER}', 'c0', 'Project ' || i, '${OLD}'`,
      time_entries: `'ex' || i, '${OWNER}', 'p0', '2026-01-01', 30, '${OLD}', '${OLD}'`,
      api_tokens: `'tx' || i, '${OWNER}', 'Token ' || i, 'hash' || i, 'uh_' || i, '${OLD}'`,
    }[table];
    const columns = {
      clients: "id, user_id, name, created_at",
      projects: "id, user_id, client_id, name, created_at",
      time_entries: "id, user_id, project_id, date, minutes, created_at, updated_at",
      api_tokens: "id, user_id, name, token_hash, prefix, created_at",
    }[table];
    db.exec(
      `WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM s WHERE i < ${add}) INSERT INTO ${table} (${columns}) SELECT ${select} FROM s`,
    );
  };
  return { db, prisma, as, count, fill };
}

/** Fires both at once and sorts out who won. */
async function race<T>(...calls: (() => Promise<T>)[]) {
  const settled = await Promise.allSettled(calls.map((c) => c()));
  return {
    won: settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : [])),
    lost: settled.flatMap((s) => (s.status === "rejected" ? [s.reason as { code?: string; message?: string }] : [])),
  };
}

const limitMessage = (n: number, kind: string) =>
  `You've reached the limit of ${n.toLocaleString("en-US")} ${kind}. Please write to the site owner if you need more.`;
const TIMER_TAKEN = "A timer is already running. Stop it first.";

describe("the guarded insert itself", () => {
  it("writes the row while it fits and writes nothing at the limit, refusing with the normal message", async () => {
    const w = world();
    const exec = vi.spyOn(w.prisma, "$executeRaw");
    const quota = { ...accountQuota("clients", "clients", OWNER, true), limit: 2 };
    await insertWithinQuota(w.prisma, "clients", { user_id: OWNER, name: "Second" }, quota);
    expect(await exec.mock.results[0].value).toBe(1);
    expect(w.count("clients")).toBe(2);

    await expect(
      insertWithinQuota(w.prisma, "clients", { user_id: OWNER, name: "Third" }, quota),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "The demo is limited to 6 clients. Create a free account to add more.",
    });
    expect(await exec.mock.results[1].value).toBe(0);
    expect(w.count("clients")).toBe(2);
  });

  it("only writes the columns it knows", async () => {
    const w = world();
    await expect(
      insertWithinQuota(
        w.prisma,
        "clients",
        { user_id: OWNER, name: "X", archived: true } as never,
        accountQuota("clients", "clients", OWNER, false),
      ),
    ).rejects.toThrow("clients.archived is not in QUOTA_TABLES.");
    expect(w.count("clients")).toBe(1);
  });

  it("covers every NOT NULL column without a default, so a future migration cannot silently break creates", () => {
    const w = world();
    for (const [table, columns] of Object.entries(QUOTA_TABLES)) {
      const info = w.db.prepare(`PRAGMA table_info(${table})`).all() as {
        name: string;
        notnull: number;
        dflt_value: unknown;
      }[];
      expect(info.length).toBeGreaterThan(0);
      const required = info.filter((c) => c.notnull === 1 && c.dflt_value === null).map((c) => c.name);
      expect(
        required.filter((c) => !(columns as readonly string[]).includes(c)),
        table,
      ).toEqual([]);
    }
  });
});

describe("two creates at limit-1: exactly one is saved", () => {
  it("clients", async () => {
    const w = world();
    w.fill("clients", QUOTAS.clients - 1);
    const { won, lost } = await race(
      () => w.as(OWNER).clients.create({ name: "One" }),
      () => w.as(OWNER).clients.create({ name: "Two" }),
    );
    expect(won).toHaveLength(1);
    expect(lost).toEqual([
      expect.objectContaining({ code: "FORBIDDEN", message: limitMessage(QUOTAS.clients, "clients") }),
    ]);
    expect(w.count("clients")).toBe(QUOTAS.clients);
  });

  it("projects", async () => {
    const w = world();
    w.fill("projects", QUOTAS.projects - 1);
    const { won, lost } = await race(
      () => w.as(OWNER).project.create({ clientId: "c0", name: "One" }),
      () => w.as(OWNER).project.create({ clientId: "c0", name: "Two" }),
    );
    expect(won).toHaveLength(1);
    expect(lost).toEqual([
      expect.objectContaining({ code: "FORBIDDEN", message: limitMessage(QUOTAS.projects, "projects") }),
    ]);
    expect(w.count("projects")).toBe(QUOTAS.projects);
  });

  it("entries", async () => {
    const w = world();
    w.fill("time_entries", QUOTAS.entries - 1);
    const log = () => w.as(OWNER).entry.create({ projectId: "p0", date: "2026-10-25", minutes: 30 });
    const { won, lost } = await race(log, log);
    expect(won).toHaveLength(1);
    expect(won[0]).toMatchObject({ minutes: 30, project: { name: "Site", client: { name: "Acme" } } });
    expect(lost).toEqual([
      expect.objectContaining({ code: "FORBIDDEN", message: limitMessage(QUOTAS.entries, "entries") }),
    ]);
    expect(w.count("time_entries")).toBe(QUOTAS.entries);
  });

  it("API tokens", async () => {
    const w = world();
    w.fill("api_tokens", MAX_TOKENS_PER_USER - 1);
    const make = () => w.as(OWNER).account.createApiToken({ name: "Laptop", access: "read", expires: "never" });
    const { won, lost } = await race(make, make);
    expect(won).toHaveLength(1);
    expect(won[0]).toMatchObject({ name: "Laptop", access: "read", expires_at: null });
    expect(lost).toEqual([
      expect.objectContaining({
        code: "BAD_REQUEST",
        message: `You can have ${MAX_TOKENS_PER_USER} active tokens. Revoke one you no longer use first.`,
      }),
    ]);
    expect(w.count("api_tokens")).toBe(MAX_TOKENS_PER_USER);
  });

  it("a demo account, with the demo limits and the demo message", async () => {
    const w = world();
    w.fill("clients", DEMO_QUOTAS.clients - 1);
    const { won, lost } = await race(
      () => w.as(OWNER, true).clients.create({ name: "One" }),
      () => w.as(OWNER, true).clients.create({ name: "Two" }),
    );
    expect(won).toHaveLength(1);
    expect(lost).toEqual([
      expect.objectContaining({
        code: "FORBIDDEN",
        message: "The demo is limited to 6 clients. Create a free account to add more.",
      }),
    ]);
    expect(w.count("clients")).toBe(DEMO_QUOTAS.clients);
  });

  it("the same client name sent twice at once keeps today's answer", async () => {
    const w = world();
    const add = () => w.as(OWNER).clients.create({ name: "Globex" });
    const { won, lost } = await race(add, add);
    expect(won).toHaveLength(1);
    expect(lost).toEqual([
      expect.objectContaining({ code: "CONFLICT", message: 'You already have a client named "Globex".' }),
    ]);
  });
});

describe("starting a timer near the limit", () => {
  const start = (w: ReturnType<typeof world>) => () =>
    w.as(OWNER).entry.start({ projectId: "p0", date: "2026-10-25", note: "" });

  it("at limit-1 with no timer running, two starts save one entry and refuse the other with the limit message", async () => {
    const w = world();
    w.fill("time_entries", QUOTAS.entries - 1);
    const { won, lost } = await race(start(w), start(w));
    expect(won).toHaveLength(1);
    expect(lost).toEqual([
      expect.objectContaining({ code: "FORBIDDEN", message: limitMessage(QUOTAS.entries, "entries") }),
    ]);
    expect(w.count("time_entries")).toBe(QUOTAS.entries);
  });

  it("below the limit, two starts run one timer; the other hears a timer is already running", async () => {
    const w = world();
    const { won, lost } = await race(start(w), start(w));
    expect(won).toHaveLength(1);
    expect(lost).toEqual([expect.objectContaining({ code: "CONFLICT", message: TIMER_TAKEN })]);
    expect(w.count("time_entries", `user_id = '${OWNER}' AND started_at IS NOT NULL`)).toBe(1);
  });

  it("a race lost at exactly the limit saves the old timer's minutes and shows the limit message", async () => {
    const w = world();
    w.fill("time_entries", QUOTAS.entries - 2);
    const startedAt = new Date(Date.now() - 30 * 60_000);
    await w.prisma.timeEntry.create({
      data: { id: "old", user_id: OWNER, project_id: "p0", date: "2026-10-25", started_at: startedAt },
    });
    const { won, lost } = await race(start(w), start(w));
    expect(won).toHaveLength(1);
    expect(lost).toEqual([
      expect.objectContaining({ code: "FORBIDDEN", message: limitMessage(QUOTAS.entries, "entries") }),
    ]);
    expect(w.count("time_entries")).toBe(QUOTAS.entries);
    const old = await w.prisma.timeEntry.findUniqueOrThrow({ where: { id: "old" } });
    expect(old.started_at).toBeNull();
    expect(old.minutes).toBeGreaterThanOrEqual(30);
  });

  it("at the limit with a timer running, the start is refused before anything is stopped", async () => {
    const w = world();
    w.fill("time_entries", QUOTAS.entries - 1);
    await w.prisma.timeEntry.create({
      data: { id: "old", user_id: OWNER, project_id: "p0", date: "2026-10-25", started_at: new Date() },
    });
    await expect(start(w)()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: limitMessage(QUOTAS.entries, "entries"),
    });
    const old = await w.prisma.timeEntry.findUniqueOrThrow({ where: { id: "old" } });
    expect(old.started_at).not.toBeNull();
  });
});

describe("a team member's entries count against the owner's limit", () => {
  function team() {
    const w = world();
    w.db.exec(
      `INSERT INTO team_members (id, owner_id, member_id, email, label) VALUES ('t1', '${OWNER}', '${MEMBER}', 'm@x.invalid', 'Member');
       INSERT INTO team_member_clients (team_member_id, client_id) VALUES ('t1', 'c0');`,
    );
    return w;
  }

  it("the member's entry and the owner's own, sent together at limit-1: exactly one is saved", async () => {
    // The member's path reads its team first, so the owner's call starts a few round trips late in turn: one of these
    // lines both up on the limit at the same moment.
    for (const lead of [0, 1, 2, 3]) {
      const w = team();
      w.fill("time_entries", QUOTAS.entries - 1);
      const { won, lost } = await race<unknown>(
        () => w.as(MEMBER).member.log({ teamId: "t1", projectId: "p0", date: "2026-10-25", minutes: 30 }),
        async () => {
          for (let i = 0; i < lead; i++) await w.prisma.$queryRaw`SELECT 1`;
          return w.as(OWNER).entry.create({ projectId: "p0", date: "2026-10-25", minutes: 30 });
        },
      );
      expect(won, `lead ${lead}`).toHaveLength(1);
      expect(lost).toEqual([
        expect.objectContaining({ code: "FORBIDDEN", message: limitMessage(QUOTAS.entries, "entries") }),
      ]);
      expect(w.count("time_entries")).toBe(QUOTAS.entries);
    }
  });

  it("a member entry with a clientId sent twice at once saves one row, and both calls return it", async () => {
    const w = team();
    const clientId = crypto.randomUUID();
    const send = () =>
      w.as(MEMBER).member.log({ teamId: "t1", projectId: "p0", date: "2026-10-25", minutes: 45, clientId });
    const [a, b] = await Promise.all([send(), send()]);
    expect(a).toMatchObject({ id: clientId, author_id: MEMBER, user_id: OWNER, minutes: 45 });
    expect(b).toMatchObject({ id: clientId });
    expect(w.count("time_entries", `id = '${clientId}'`)).toBe(1);
  });

  it("the owner's entry.create with a clientId sent twice at once also saves one row", async () => {
    const w = world();
    const clientId = crypto.randomUUID();
    const send = () => w.as(OWNER).entry.create({ projectId: "p0", date: "2026-10-25", minutes: 15, clientId });
    const [a, b] = await Promise.all([send(), send()]);
    expect(a).toMatchObject({ id: clientId, project: { name: "Site" } });
    expect(b).toMatchObject({ id: clientId, project: { name: "Site" } });
    expect(w.count("time_entries", `id = '${clientId}'`)).toBe(1);
  });
});

describe("the OAuth grant keeps today's rule in one statement", () => {
  const APP = "https://usehourly.app";
  const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
  const VERIFIER = "a-long-random-verifier-0123456789-abcdefghijklmnopqrstuvwxyz";

  async function grant(w: ReturnType<typeof world>, clientId: string) {
    const res = await decideAuthorization(
      w.prisma,
      OWNER,
      {
        response_type: "code",
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: await pkceChallenge(VERIFIER),
        code_challenge_method: "S256",
        state: "xyz",
      },
      { allow: true, access: "write" },
      APP,
    );
    if (!res.ok) throw new Error(res.message);
    const code = new URL(res.redirectUrl).searchParams.get("code") as string;
    return () =>
      exchangeCode(
        w.prisma,
        {
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          redirect_uri: REDIRECT,
          code_verifier: VERIFIER,
        },
        null,
      );
  }
  async function app(w: ReturnType<typeof world>, name = "Claude") {
    const res = await registerClient(w.prisma, { client_name: name, redirect_uris: [REDIRECT] }, null);
    if ("error" in res) throw new Error(res.error_description);
    return res.client_id;
  }
  const live = `user_id = '${OWNER}' AND revoked_at IS NULL`;

  // Two different apps: two grants from the SAME app may both win, because the second replaces the first (today's rule).
  it("at 19 live tokens, none from these apps, two grants together give exactly one new token", async () => {
    const w = world();
    const [claude, cursor] = [await app(w), await app(w, "Cursor")];
    w.fill("api_tokens", MAX_TOKENS_PER_USER - 1);
    const [one, two] = [await grant(w, claude), await grant(w, cursor)];
    const results = await Promise.all([one(), two()]);
    expect(results.filter((r) => "access_token" in r)).toHaveLength(1);
    expect(results.filter((r) => "error" in r)).toEqual([
      expect.objectContaining({ error: "access_denied", status: 403 }),
    ]);
    expect(w.count("api_tokens", live)).toBe(MAX_TOKENS_PER_USER);
  });

  it("with this app's earlier token among 20 live ones, a grant succeeds and the earlier one is revoked", async () => {
    const w = world();
    const id = await app(w);
    w.fill("api_tokens", MAX_TOKENS_PER_USER - 1);
    w.db.exec(
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, oauth_client_id, created_at) VALUES ('earlier', '${OWNER}', 'Claude (OAuth)', 'h-earlier', 'uh_e', '${id}', '${OLD}')`,
    );
    expect(await (await grant(w, id))()).toHaveProperty("access_token");
    expect(w.count("api_tokens", `id = 'earlier' AND revoked_at IS NOT NULL`)).toBe(1);
    expect(w.count("api_tokens", live)).toBe(MAX_TOKENS_PER_USER);
  });

  it("a legacy earlier token (no app id) is matched by name", async () => {
    const w = world();
    const id = await app(w);
    w.fill("api_tokens", MAX_TOKENS_PER_USER - 1);
    w.db.exec(
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at) VALUES ('legacy', '${OWNER}', 'Claude (OAuth)', 'h-legacy', 'uh_l', '${OLD}')`,
    );
    expect(await (await grant(w, id))()).toHaveProperty("access_token");
    expect(w.count("api_tokens", `id = 'legacy' AND revoked_at IS NOT NULL`)).toBe(1);
  });
});

describe("rows written by the guarded insert look like rows Prisma writes", () => {
  const shape = (text: unknown) => String(text).replace(/\d/g, "9");
  const pause = () => new Promise((r) => setTimeout(r, 10));

  it("created_at and updated_at are stored as the same text, and read back in the right order", async () => {
    const w = world();
    const owner = w.as(OWNER);
    await w.prisma.client.create({ data: { id: "c-prisma", user_id: OWNER, name: "By Prisma" } });
    await w.prisma.project.create({ data: { id: "p-prisma", user_id: OWNER, client_id: "c0", name: "By Prisma" } });
    await w.prisma.timeEntry.create({
      data: { id: "e-prisma", user_id: OWNER, project_id: "p0", date: "2026-10-25", minutes: 10 },
    });
    await w.prisma.apiToken.create({
      data: { id: "t-prisma", user_id: OWNER, name: "By Prisma", token_hash: "h-prisma", prefix: "uh_p" },
    });
    await pause();
    const client = await owner.clients.create({ name: "By guard" });
    const project = await owner.project.create({ clientId: "c0", name: "By guard" });
    const entry = await owner.entry.create({ projectId: "p0", date: "2026-10-25", minutes: 20 });
    await owner.account.createApiToken({ name: "By guard", access: "write", expires: "never" });

    const rows = (table: string, cols: string) =>
      w.db
        .prepare(`SELECT ${cols} FROM ${table} WHERE user_id = '${OWNER}' AND created_at <> '${OLD}'`)
        .all() as Record<string, unknown>[];
    for (const table of ["clients", "projects", "time_entries", "api_tokens"]) {
      const cols =
        table === "time_entries"
          ? "typeof(created_at) AS t, created_at AS c, typeof(updated_at) AS ut, updated_at AS u"
          : "typeof(created_at) AS t, created_at AS c";
      const [prismaRow, guardRow, ...rest] = rows(table, cols);
      expect(rest, table).toEqual([]);
      expect(guardRow.t, table).toBe(prismaRow.t);
      expect(shape(guardRow.c), table).toBe(shape(prismaRow.c));
      if (table === "time_entries") {
        expect(guardRow.ut).toBe(prismaRow.ut);
        expect(shape(guardRow.u)).toBe(shape(prismaRow.u));
      }
    }

    const clients = await owner.clients.list();
    const byName = (name: string) => clients.find((c) => c.name === name)?.created_at as Date;
    expect(byName("By guard").getTime()).toBeGreaterThan(byName("By Prisma").getTime());
    expect(client.created_at).toEqual(byName("By guard"));
    expect(Math.abs(client.created_at.getTime() - Date.now())).toBeLessThan(10_000);

    const projects = clients.find((c) => c.id === "c0")?.projects ?? [];
    const projectAt = (name: string) => projects.find((p) => p.name === name)?.created_at as Date;
    expect(projectAt("By guard").getTime()).toBeGreaterThan(projectAt("By Prisma").getTime());
    expect(project.created_at).toEqual(projectAt("By guard"));

    const entries = await owner.entry.list({ from: "2026-10-25", to: "2026-10-25" });
    expect(entries.map((e) => e.id)).toEqual([entry.id, "e-prisma"]); // newest first
    expect(entry.updated_at).toEqual(entry.created_at);

    const tokens = await owner.account.listApiTokens();
    expect(tokens.slice(0, 2).map((t) => t.name)).toEqual(["By guard", "By Prisma"]);
  });
});

describe("a first day well below every limit (PR #335: browser tests caught what these did not)", () => {
  // D1 counts the entry_changes row that time_entries' insert trigger writes, so a saved entry reports 2 changes.
  // The guard once read that as "nothing written" and refused every entry with the limit message.
  it("adds a client, a project, an entry and a timer, and each answer is the saved row", async () => {
    const w = world();
    const owner = w.as(OWNER);

    const client = await owner.clients.create({ name: "Globex" });
    expect(client).toMatchObject({
      user_id: OWNER,
      name: "Globex",
      color: DEFAULT_CLIENT_COLOR,
      archived: false,
      round_step: 0,
    });
    const project = await owner.project.create({ clientId: client.id, name: "Rebrand" });
    expect(project).toMatchObject({ user_id: OWNER, client_id: client.id, name: "Rebrand" });

    const entry = await owner.entry.create({ projectId: project.id, date: "2026-10-25", minutes: 45, note: "Kickoff" });
    expect(entry).toMatchObject({ user_id: OWNER, project_id: project.id, date: "2026-10-25", minutes: 45 });
    expect(entry.note).toBe("Kickoff");
    expect(entry.started_at).toBeNull();
    expect(entry.project.client.name).toBe("Globex");

    const timer = await owner.entry.start({ projectId: project.id, date: "2026-10-25", note: "Design" });
    expect(timer).toMatchObject({ user_id: OWNER, project_id: project.id, minutes: 0, note: "Design" });
    expect(timer.started_at).toBeInstanceOf(Date);

    expect(w.count("time_entries", `user_id = '${OWNER}' AND id IN ('${entry.id}', '${timer.id}')`)).toBe(2);
    // the trigger's rows are what made D1 report 2 changes per insert
    const logged = w.db
      .prepare(`SELECT COUNT(*) AS n FROM entry_changes WHERE entry_id IN ('${entry.id}', '${timer.id}')`)
      .get() as { n: number };
    expect(Number(logged.n)).toBe(2);
  });
});

describe("no value is pasted into the SQL", () => {
  it("binds the name, so quotes cannot break out", async () => {
    const w = world();
    const name = "O'Brien'); DROP TABLE clients; --";
    const made = await w.as(OWNER).clients.create({ name });
    expect(made.name).toBe(name);
    expect(w.count("clients")).toBe(2);
  });
});
