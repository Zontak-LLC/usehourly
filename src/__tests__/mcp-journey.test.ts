import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashApiToken, newApiToken } from "@/lib/api-token";
import { handleMcpHttp, originAllowed } from "@/server/mcp/http";
import { OUTPUT_SCHEMAS } from "@/server/mcp/output-schemas";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { withGuardedInsert } from "./helpers/guarded-insert-mock";
import { memoryInvoiceLogos } from "./helpers/memory-invoice-logos";
import { memoryNonBillableDays } from "./helpers/memory-non-billable";
import { memoryRateLimit } from "./helpers/memory-rate-limit";

/**
 * A person connects an AI assistant to UseHourly: makes a token in the app, the assistant
 * connects over HTTP, lists tools, logs time, runs a timer, issues an invoice. Everything goes
 * through the real router and protocol code with only the database mocked.
 */

const createCaller = createCallerFactory(appRouter);
/** Tools whose successful result has been checked against its outputSchema (see `call` in setup). */
const outputChecked = new Set<string>();
const URL_MCP = "https://usehourly.app/api/mcp";
const APP = "https://usehourly.app";

const acme = {
  id: "c1",
  name: "Acme",
  color: "#6366f1",
  legal_name: "Acme Holdings, Inc.",
  address: "500 Market St",
  projects: [
    { id: "p1", name: "Website", hourly_rate: 10000, billable: true },
    { id: "p2", name: "Support", hourly_rate: 5000, billable: false },
  ],
};
const globex = {
  id: "c2",
  name: "Globex",
  color: "#10b981",
  legal_name: null,
  address: null,
  projects: [{ id: "p3", name: "Website", hourly_rate: 9000, billable: true }],
};

const entryRow = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  user_id: "u1",
  project_id: "p1",
  date: "2026-10-09",
  minutes: 90,
  note: "homepage",
  started_at: null,
  project: { id: "p1", name: "Website", client: { id: "c1", name: "Acme" } },
  ...over,
});

type TokenRow = {
  id: string;
  name: string;
  access: string;
  token_version: number;
  expires_at: number | null;
  revoked_at: number | null;
  last_used_at: number | null;
  user: { id: string; token_version: number };
};

function setup(over: Partial<TokenRow> = {}) {
  const token = newApiToken();
  const row: TokenRow = {
    id: "t1",
    name: "Claude Code",
    access: "write",
    token_version: 0,
    expires_at: null,
    revoked_at: null,
    last_used_at: null,
    user: { id: "u1", token_version: 0 },
    ...over,
  };
  let expectedHash = "";
  const limits = memoryRateLimit();
  const prisma = {
    ...memoryInvoiceLogos(),
    ...memoryNonBillableDays(),
    apiToken: {
      findUnique: vi.fn(async ({ where }: { where: { token_hash: string } }) =>
        where.token_hash === expectedHash ? row : null,
      ),
      update: vi.fn(async () => row),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "t9", ...data })),
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    rateLimit: limits.rateLimit,
    client: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => [acme, globex]),
      findFirst: vi.fn(async () => acme),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "c9", color: "#6366f1", ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({ id: "c1" })),
    },
    project: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => ({ id: "p1" })),
      findMany: vi.fn(async () => [] as unknown[]),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p9", ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      groupBy: vi.fn(),
    },
    timeEntry: {
      // Marks the entries an invoice bills (migration 0035); answers how many it marked.
      updateMany: vi.fn(async (a?: { where?: { id?: { in?: unknown[] } } }) => ({
        count: a?.where?.id?.in?.length ?? 0,
      })),
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => [] as unknown[]),
      findFirst: vi.fn(async () => null as unknown),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => entryRow({ ...data, id: "e2" })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => entryRow(data)),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      groupBy: vi.fn(async () => []),
    },
    invoice: {
      findFirst: vi.fn(async () => null),
      // Two invoices exist this year (asked for their numbers only when suggesting the next one).
      findMany: vi.fn(async (a?: { select?: Record<string, boolean> }) =>
        a?.select && Object.keys(a.select).join() === "number"
          ? [{ number: "INV-2026-001" }, { number: "INV-2026-002" }]
          : [],
      ),
      create: vi.fn(async () => ({ id: "inv1" })),
      count: vi.fn(async () => 2),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(),
    },
    timesheetShare: {
      count: vi.fn(async () => 0),
      create: vi.fn(async (_a: { data: Record<string, unknown> }) => ({ id: "s1" })),
    },
    authUser: {
      findUnique: vi.fn(async () => ({
        id: "u1",
        name: "Jo Freelance",
        email: "jo@example.com",
        created_at: new Date("2026-01-01"),
        business_name: "Jo Design LLC",
        ein: "12-3456789",
        address: "1 Main St",
        logo: "data:image/png;base64,AAAA",
        payment_instructions: "Pay by ACH",
        email_verified_at: null,
        token_version: 0,
      })),
    },
  };
  const ready = hashApiToken(token).then((h) => {
    expectedHash = h;
  });

  async function http(
    body: unknown,
    init: { token?: string | null; headers?: Record<string, string>; method?: string } = {},
  ) {
    await ready;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      host: "usehourly.app",
      ...init.headers,
    };
    const t = init.token === undefined ? token : init.token;
    if (t) headers.authorization = `Bearer ${t}`;
    const res = await handleMcpHttp(
      new Request(URL_MCP, {
        method: init.method ?? "POST",
        headers,
        body:
          init.method && init.method !== "POST" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      }),
      prisma as never,
      APP,
    );
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
  }

  let id = 0;
  const rpc = async (method: string, params?: unknown) =>
    (await http({ jsonrpc: "2.0", id: ++id, method, params })).json;
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await rpc("tools/call", { name, arguments: args });
    const result = r.result as {
      isError: boolean;
      content: { text: string }[];
      structuredContent?: Record<string, unknown>;
    };
    // Every successful result in every scenario must match the outputSchema the tool advertises.
    if (!result.isError) {
      const schema = OUTPUT_SCHEMAS[name];
      expect(schema, `${name} has an output schema`).toBeDefined();
      const checked = schema.safeParse(result.structuredContent);
      outputChecked.add(name);
      expect(checked.success, `${name} result matches its outputSchema: ${JSON.stringify(checked.error?.issues)}`).toBe(
        true,
      );
    }
    return { isError: result.isError, text: result.content[0].text, data: result.structuredContent };
  };
  withGuardedInsert(prisma); // creates count and insert in one statement; this reads it back onto count and create
  return { prisma, token, row, http, rpc, call, limits };
}

describe("making and managing access tokens", () => {
  const asUser = (prisma: ReturnType<typeof setup>["prisma"], uid: string | null) =>
    createCaller({ session: uid ? { user: { id: uid }, expires: "" } : null, prisma: prisma as never });

  it("shows the secret once and stores only its hash", async () => {
    const { prisma } = setup();
    const made = await asUser(prisma, "u1").account.createApiToken({
      name: " Claude Code ",
      access: "write",
      expires: "90d",
    });
    expect(made.token).toMatch(/^uh_[A-Za-z0-9_-]{43}$/);
    const stored = (prisma.apiToken.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(stored.token_hash).toBe(await hashApiToken(made.token));
    expect(JSON.stringify(stored)).not.toContain(made.token);
    expect(stored).toMatchObject({
      user_id: "u1",
      name: "Claude Code",
      access: "write",
      token_version: 0,
      prefix: made.token.slice(0, 8),
    });
    expect(typeof stored.expires_at).toBe("number");
  });

  it("makes a token that never expires, and refuses a blank name or a 21st token (and writes nothing)", async () => {
    const { prisma } = setup();
    const c = asUser(prisma, "u1");
    await c.account.createApiToken({ name: "Forever", access: "read", expires: "never" });
    expect((prisma.apiToken.create.mock.calls[0][0] as { data: { expires_at: unknown } }).data.expires_at).toBeNull();

    prisma.apiToken.create.mockClear();
    await expect(c.account.createApiToken({ name: "   ", access: "read", expires: "never" })).rejects.toThrow();
    prisma.apiToken.count.mockResolvedValue(20);
    await expect(
      c.account.createApiToken({ name: "One more", access: "read", expires: "never" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(prisma.apiToken.create).not.toHaveBeenCalled();
  });

  it("lists tokens without hashes, revokes only the caller's own, and needs a signed-in user", async () => {
    const { prisma } = setup();
    prisma.apiToken.findMany.mockResolvedValue([
      {
        id: "t1",
        name: "A",
        prefix: "uh_abcde",
        access: "read",
        expires_at: null,
        last_used_at: null,
        revoked_at: 5,
        created_at: new Date(),
      },
      {
        id: "t2",
        name: "B",
        prefix: "uh_fghij",
        access: "write",
        expires_at: 1,
        last_used_at: null,
        revoked_at: null,
        created_at: new Date(),
      },
    ] as never);
    const list = await asUser(prisma, "u1").account.listApiTokens();
    expect(list.map((t) => t.state)).toEqual(["revoked", "expired"]);
    expect(JSON.stringify(list)).not.toContain("token_hash");
    expect(prisma.apiToken.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: "u1" } }));

    await asUser(prisma, "u1").account.revokeApiToken({ id: "t2" });
    expect(prisma.apiToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t2", user_id: "u1", revoked_at: null } }),
    );
    prisma.apiToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(asUser(prisma, "u1").account.revokeApiToken({ id: "someone-elses" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await expect(asUser(prisma, null).account.listApiTokens()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      asUser(prisma, null).account.createApiToken({ name: "x", access: "read", expires: "never" }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("who may connect", () => {
  it("answers 401 with a Bearer challenge when there is no token or a made-up one", async () => {
    const { http, prisma } = setup();
    const none = await http({ jsonrpc: "2.0", id: 1, method: "ping" }, { token: null });
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toContain("Bearer");
    const fake = await http({ jsonrpc: "2.0", id: 1, method: "ping" }, { token: newApiToken() });
    expect(fake.status).toBe(401);
    const junk = await http({ jsonrpc: "2.0", id: 1, method: "ping" }, { token: "not-a-token" });
    expect(junk.status).toBe(401);
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it("refuses a revoked token, an expired one, and one from before a password change", async () => {
    const revoked = await setup({ revoked_at: 10 }).http({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(revoked.status).toBe(401);
    expect(revoked.json.error).toMatch(/revoked/);

    const expired = await setup({ expires_at: 100 }).http({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(expired.status).toBe(401);
    expect(expired.json.error).toMatch(/expired/);

    const stale = await setup({ token_version: 0, user: { id: "u1", token_version: 3 } }).http({
      jsonrpc: "2.0",
      id: 1,
      method: "ping",
    });
    expect(stale.status).toBe(401);
    expect(stale.json.error).toMatch(/password/);
  });

  it("throttles an address that keeps guessing, even when the guesses arrive all at once", async () => {
    const s = setup();
    const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
    const burst = await Promise.all(
      Array.from({ length: 60 }, () => s.http(ping, { token: null, headers: { "cf-connecting-ip": "203.0.113.9" } })),
    );
    expect(burst.filter((r) => r.status === 401)).toHaveLength(30);
    const blocked = burst.filter((r) => r.status === 429);
    expect(blocked).toHaveLength(30);
    expect(blocked[0].headers.get("retry-after")).toBeTruthy();
    // another address is not affected, and the good token from the blocked address still works
    expect((await s.http(ping, { token: null, headers: { "cf-connecting-ip": "198.51.100.2" } })).status).toBe(401);
    expect((await s.http(ping, { headers: { "cf-connecting-ip": "203.0.113.9" } })).status).toBe(200);
  });

  it("throttles a token that floods the server, counting a simultaneous burst exactly", async () => {
    const s = setup();
    const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
    const burst = await Promise.all(Array.from({ length: 150 }, () => s.http(ping)));
    expect(burst.filter((r) => r.status === 200)).toHaveLength(120);
    expect(burst.filter((r) => r.status === 429)).toHaveLength(30);
  });

  it("refuses other websites, GET and DELETE, bad JSON, and oversized bodies", async () => {
    const s = setup();
    expect(
      (await s.http({ jsonrpc: "2.0", id: 1, method: "ping" }, { headers: { origin: "https://evil.example" } })).status,
    ).toBe(403);
    expect((await s.http({ jsonrpc: "2.0", id: 1, method: "ping" }, { headers: { origin: APP } })).status).toBe(200);
    expect((await s.http(null, { method: "GET" })).status).toBe(405);
    expect((await s.http(null, { method: "DELETE" })).status).toBe(405);
    const bad = await s.http("{not json");
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe(-32700);
    expect((await s.http("x".repeat(300 * 1024))).status).toBe(413);
    expect(originAllowed(null, "usehourly.app", APP)).toBe(true);
    expect(originAllowed("not a url", "usehourly.app", APP)).toBe(false);
  });

  it("records when the token was last used", async () => {
    const s = setup();
    await s.rpc("ping");
    expect(s.prisma.apiToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1" }, data: { last_used_at: expect.any(Number) } }),
    );
  });
});

describe("the protocol", () => {
  it("negotiates a version, advertises tools, resources and prompts, and ignores notifications", async () => {
    const s = setup();
    const init = await s.rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "t", version: "1" },
    });
    expect(init.result.protocolVersion).toBe("2025-03-26");
    expect(init.result.serverInfo.name).toBe("usehourly");
    expect(Object.keys(init.result.capabilities).sort()).toEqual(["prompts", "resources", "tools"]);
    expect(init.result.instructions).toMatch(/minutes/);
    const future = await s.rpc("initialize", { protocolVersion: "2099-01-01" });
    expect(future.result.protocolVersion).toBe("2025-06-18");

    const note = await s.http({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(note.status).toBe(202);
    expect(note.json).toBeNull();
    expect((await s.rpc("ping")).result).toEqual({});
  });

  it("lists every tool with a JSON schema, honest read/write hints and destructive flags", async () => {
    const s = setup();
    const { tools } = (await s.rpc("tools/list")).result as {
      tools: {
        name: string;
        inputSchema: { type: string; properties?: object };
        annotations: Record<string, boolean>;
      }[];
    };
    const names = tools.map((t) => t.name);
    for (const n of [
      "whoami",
      "list_projects",
      "list_entries",
      "log_time",
      "log_time_on_days",
      "set_day_totals",
      "update_entry",
      "delete_entry",
      "start_timer",
      "stop_timer",
      "create_client",
      "create_project",
      "update_project",
      "archive_project",
      "create_invoice",
      "mark_invoice_paid",
      "annual_report",
      "parse_duration",
      "get_timesheet",
      "share_timesheet",
    ]) {
      expect(names).toContain(n);
    }
    expect(new Set(names).size).toBe(names.length);
    for (const t of tools) expect(t.inputSchema.type).toBe("object");
    // Every tool says what it returns (an object schema), and every parameter explains itself.
    for (const t of tools as unknown as {
      name: string;
      inputSchema: { properties?: Record<string, { description?: string }> };
      outputSchema?: { type: string; properties?: object };
    }[]) {
      expect(t.outputSchema?.type, `${t.name} outputSchema`).toBe("object");
      expect(Object.keys(t.outputSchema?.properties ?? {}).length, `${t.name} outputSchema properties`).toBeGreaterThan(
        0,
      );
      for (const [param, def] of Object.entries(t.inputSchema.properties ?? {})) {
        expect(def.description, `${t.name}.${param} has a description`).toBeTruthy();
      }
    }
    expect(Object.keys(OUTPUT_SCHEMAS).sort()).toEqual([...names].sort());
    const by = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
    expect(by.list_entries).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(by.log_time).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(by.delete_entry).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(by.delete_invoice.destructiveHint).toBe(true);
    expect(by.get_timesheet).toMatchObject({ readOnlyHint: true });
    expect(by.share_timesheet).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    // Optional fields are optional in the schema; required ones are required.
    const logTime = tools.find((t) => t.name === "log_time")?.inputSchema as { required?: string[] };
    expect(logTime.required).toEqual(expect.arrayContaining(["project", "date"]));
    expect(logTime.required).not.toContain("note");
  });

  it("answers unknown methods, bad requests and batches the JSON-RPC way", async () => {
    const s = setup();
    expect((await s.rpc("nope/nothing")).error.code).toBe(-32601);
    const badTool = await s.rpc("tools/call", { name: "not_a_tool" });
    expect(badTool.error.code).toBe(-32602);
    const junk = await s.http({ hello: "world" });
    expect(junk.status).toBe(400);
    expect(junk.json.error.code).toBe(-32600);
    const batch = await s.http([
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]);
    expect(batch.json.map((r: { id: number }) => r.id)).toEqual([1, 2]);
    expect((await s.http([])).status).toBe(400);
  });

  it("serves resources and prompts", async () => {
    const s = setup();
    const res = (await s.rpc("resources/list")).result.resources.map((r: { uri: string }) => r.uri);
    expect(res).toContain("usehourly://projects");
    const projects = (await s.rpc("resources/read", { uri: "usehourly://projects" })).result.contents[0];
    expect(JSON.parse(projects.text).projects.map((p: { label: string }) => p.label)).toEqual([
      "Acme / Website",
      "Acme / Support",
      "Globex / Website",
    ]);
    expect((await s.rpc("resources/read", { uri: "usehourly://secrets" })).error.code).toBe(-32602);
    expect((await s.rpc("resources/templates/list")).result.resourceTemplates[0].uriTemplate).toContain("{from}");

    const prompt = await s.rpc("prompts/get", {
      name: "log_session_time",
      arguments: { date: "2026-10-16", duration: "2h", what: "Moved the back end", project: "Acme / Website" },
    });
    expect(prompt.result.messages[0].content.text).toContain("Acme / Website");
    expect(
      (await s.rpc("prompts/get", { name: "log_session_time", arguments: { date: "2026-10-16" } })).error.message,
    ).toMatch(/duration/);
    expect((await s.rpc("prompts/list")).result.prompts.map((p: { name: string }) => p.name)).toEqual([
      "log_session_time",
      "week_summary",
      "client_timesheet",
      "invoice_client",
    ]);
  });
});

describe("an assistant tracks a day of work", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("reads the account and projects only for its own user", async () => {
    const me = await s.call("whoami");
    expect(me.data).toMatchObject({
      email: "jo@example.com",
      token_access: "write",
      business: { name: "Jo Design LLC", has_logo: true },
    });
    expect(me.text).not.toContain("base64");
    const projects = await s.call("list_projects");
    expect((projects.data as { projects: { id: string }[] }).projects.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(s.prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: "u1", archived: false } }),
    );
  });

  it("logs '1h30' on 'Acme / Website' as 90 minutes for the token's owner", async () => {
    const r = await s.call("log_time", {
      project: "Acme / Website",
      date: "2026-10-09",
      duration: "1h30",
      note: "  homepage hero  ",
    });
    expect(r.isError).toBe(false);
    expect(s.prisma.project.findFirst).toHaveBeenCalledWith({ where: { id: "p1", user_id: "u1" } });
    expect(s.prisma.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          id: expect.any(String),
          user_id: "u1",
          project_id: "p1",
          date: "2026-10-09",
          minutes: 90,
          note: "homepage hero",
        },
      }),
    );
    expect(r.data?.logged).toMatchObject({
      minutes: 90,
      hours: 1.5,
      project: { name: "Website" },
      client: { name: "Acme" },
    });
  });

  it("finds a project by id, by plain name when unique, and by 'client > project' spelling", async () => {
    await s.call("log_time", { project: "p3", date: "2026-10-09", minutes: 30 });
    expect(s.prisma.project.findFirst).toHaveBeenLastCalledWith({ where: { id: "p3", user_id: "u1" } });
    await s.call("log_time", { project: "support", date: "2026-10-09", minutes: 30 });
    expect(s.prisma.project.findFirst).toHaveBeenLastCalledWith({ where: { id: "p2", user_id: "u1" } });
    await s.call("log_time", { project: "globex > website", date: "2026-10-09", minutes: 30 });
    expect(s.prisma.project.findFirst).toHaveBeenLastCalledWith({ where: { id: "p3", user_id: "u1" } });
  });

  it("explains an ambiguous or unknown project instead of guessing, and logs nothing", async () => {
    const amb = await s.call("log_time", { project: "Website", date: "2026-10-09", minutes: 30 });
    expect(amb.isError).toBe(true);
    expect(amb.text).toMatch(/more than one/);
    expect(amb.text).toContain("Acme / Website");
    expect(amb.text).toContain("Globex / Website");

    const none = await s.call("log_time", { project: "Initech / Rebrand", date: "2026-10-09", minutes: 30 });
    expect(none.isError).toBe(true);
    expect(none.text).toMatch(/Available/);
    expect(s.prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it("rejects bad input as a tool error and never touches the database", async () => {
    for (const args of [
      { project: "p1", date: "10/09/2026", minutes: 30 },
      { project: "p1", date: "2026-10-09" },
      { project: "p1", date: "2026-10-09", minutes: 0 },
      { project: "p1", date: "2026-10-09", minutes: 2000 },
      { project: "p1", date: "2026-10-09", duration: "banana" },
    ]) {
      const r = await s.call("log_time", args);
      expect(r.isError).toBe(true);
    }
    expect(s.prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it("keeps a read-only token away from every write tool", async () => {
    const ro = setup({ access: "read" });
    expect((await ro.call("list_projects")).isError).toBe(false);
    for (const [name, args] of [
      ["log_time", { project: "p1", date: "2026-10-09", minutes: 30 }],
      ["delete_entry", { id: "e1" }],
      ["start_timer", { project: "p1", date: "2026-10-09" }],
      ["create_client", { name: "Nope" }],
      ["create_invoice", { client: "Acme", from: "2026-10-01", to: "2026-10-31", issue_date: "2026-11-01" }],
    ] as const) {
      const r = await ro.call(name, args);
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/read-only/);
    }
    expect(ro.prisma.timeEntry.create).not.toHaveBeenCalled();
    expect(ro.prisma.timeEntry.deleteMany).not.toHaveBeenCalled();
    expect(ro.prisma.client.create).not.toHaveBeenCalled();
    expect(ro.prisma.invoice.create).not.toHaveBeenCalled();
  });

  it("lists a week with totals per project and day, and can narrow to one project", async () => {
    // entry.list reads the account's projects and clients next to the entries and joins them itself
    s.prisma.project.findMany.mockResolvedValue([
      { id: "p1", name: "Website", client_id: "c1", client: { id: "c1", name: "Acme" } },
      { id: "p3", name: "Website", client_id: "c2", client: { id: "c2", name: "Globex" } },
    ]);
    s.prisma.timeEntry.findMany.mockResolvedValue([
      entryRow({ id: "a", date: "2026-10-09", minutes: 90 }),
      entryRow({
        id: "b",
        date: "2026-10-09",
        minutes: 30,
        project_id: "p3",
        project: { id: "p3", name: "Website", client: { id: "c2", name: "Globex" } },
      }),
      entryRow({ id: "c", date: "2026-10-08", minutes: 60 }),
    ]);
    const all = await s.call("list_entries", { from: "2026-10-05", to: "2026-10-11" });
    expect(all.data?.summary).toMatchObject({
      total_minutes: 180,
      total_hours: 3,
      by_project: [
        { project: "Website", client: "Acme", minutes: 150, hours: 2.5 },
        { project: "Website", client: "Globex", minutes: 30, hours: 0.5 },
      ],
      by_date: [
        { date: "2026-10-08", minutes: 60 },
        { date: "2026-10-09", minutes: 120 },
      ],
    });
    expect(s.prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: "u1", date: { gte: "2026-10-05", lte: "2026-10-11" } } }),
    );
    const one = await s.call("list_entries", { from: "2026-10-05", to: "2026-10-11", project: "Globex / Website" });
    expect((one.data as { entries: unknown[] }).entries.length).toBe(1);
    expect((await s.call("list_entries", { from: "2026-10-11", to: "2026-10-05" })).isError).toBe(true);
  });

  it("runs a timer: start, check, stop", async () => {
    const started = await s.call("start_timer", { project: "Acme / Website", date: "2026-10-09", note: "deploy" });
    expect(started.isError).toBe(false);
    expect(s.prisma.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ user_id: "u1", project_id: "p1", started_at: expect.any(Date) }),
      }),
    );

    s.prisma.timeEntry.findFirst.mockResolvedValue(
      entryRow({ minutes: 10, started_at: new Date(Date.now() - 5 * 60_000) }),
    );
    const running = await s.call("get_running_timer");
    expect((running.data as { running: { elapsed_minutes: number } }).running.elapsed_minutes).toBeGreaterThanOrEqual(
      15,
    );

    await s.call("stop_timer");
    expect(s.prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ started_at: null }) }),
    );

    s.prisma.timeEntry.findFirst.mockResolvedValue(null);
    const none = await s.call("stop_timer");
    expect(none.isError).toBe(true);
    expect(none.text).toMatch(/No timer/);
  });

  it("edits, merges and deletes entries only inside the owner's data", async () => {
    s.prisma.timeEntry.findFirst.mockResolvedValue(entryRow());
    await s.call("update_entry", { id: "e1", duration: "2h", note: "revised" });
    expect(s.prisma.timeEntry.findFirst).toHaveBeenCalledWith({ where: { id: "e1", user_id: "u1" } });
    expect(s.prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "e1", user_id: "u1" }, data: { minutes: 120, note: "revised" } }),
    );
    expect((await s.call("update_entry", { id: "e1" })).isError).toBe(true);

    s.prisma.timeEntry.deleteMany.mockResolvedValueOnce({ count: 0 });
    const miss = await s.call("delete_entry", { id: "someone-elses" });
    expect(miss.isError).toBe(true);
    expect(s.prisma.timeEntry.deleteMany).toHaveBeenCalledWith({ where: { id: "someone-elses", user_id: "u1" } });
    expect((await s.call("delete_entry", { id: "e1" })).isError).toBe(false);

    s.prisma.timeEntry.findMany.mockResolvedValue([
      entryRow({ id: "a" }),
      entryRow({ id: "b", minutes: 30, note: "more" }),
    ]);
    const merged = await s.call("merge_entries", { ids: ["a", "b"] });
    expect(merged.data).toMatchObject({ id: "a", minutes: 120, merged: 2 });
    expect((await s.call("merge_entries", { ids: ["a"] })).isError).toBe(true);
  });

  it("fills several days and sets day totals, reporting what it skipped", async () => {
    s.prisma.timeEntry.findMany.mockResolvedValue([{ date: "2026-10-06" }]);
    const many = await s.call("log_time_on_days", {
      project: "Acme / Website",
      dates: ["2026-10-05", "2026-10-06", "2026-10-07"],
      duration: "1h",
    });
    expect(many.data).toMatchObject({ minutes: 60, created: 2, skipped: ["2026-10-06"] });

    s.prisma.timeEntry.findMany.mockResolvedValue([]);
    const set = await s.call("set_day_totals", {
      project: "p1",
      cells: [
        { date: "2026-10-05", minutes: 120 },
        { date: "2026-10-06", minutes: 0 },
      ],
    });
    expect(set.data).toMatchObject({ created: 1, updated: 0, deleted: 0 });
    expect((await s.call("set_day_totals", { project: "p1", cells: [] })).isError).toBe(true);
  });

  it("manages clients and projects, converting dollars to cents", async () => {
    s.prisma.client.findFirst.mockResolvedValueOnce(null as never);
    await s.call("create_client", { name: "Initech" });
    const id = expect.any(String); // the guarded insert makes the id (server/quota-insert.ts)
    expect(s.prisma.client.create).toHaveBeenCalledWith({
      data: { id, user_id: "u1", name: "Initech", color: "#2563c9" },
    });

    s.prisma.client.findFirst.mockResolvedValue(acme as never);
    s.prisma.project.findFirst.mockResolvedValue(null as never);
    const made = await s.call("create_project", {
      client: "Acme",
      name: "Retainer",
      hourly_rate: 62.5,
      billable: false,
    });
    expect(s.prisma.project.create).toHaveBeenCalledWith({
      data: { id, user_id: "u1", client_id: "c1", name: "Retainer", hourly_rate: 6250, billable: false },
    });
    expect(made.data?.project).toMatchObject({ label: "Acme / Retainer", hourly_rate: 62.5 });

    const dup = await s.call("create_client", { name: "Acme" });
    expect(dup.isError).toBe(true);

    const archived = await s.call("archive_project", { project: "Acme / Support" });
    expect(s.prisma.project.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p2", user_id: "u1" } }),
    );
    expect(archived.data).toMatchObject({ archived: "Acme / Support" });
  });

  it("issues an invoice with the next number and computes the total on the server", async () => {
    s.prisma.client.findFirst.mockResolvedValue({
      id: "c1",
      name: "Acme",
      legal_name: "Acme Holdings, Inc.",
      address: "500 Market St",
      logo: "data:image/png;base64,AAAA",
    } as never);
    s.prisma.timeEntry.findMany.mockResolvedValue([
      {
        date: "2026-10-02",
        minutes: 90,
        note: "hero",
        started_at: null,
        project_id: "p1",
        project: { name: "Website", hourly_rate: 10000, billable: true },
      },
      {
        date: "2026-10-03",
        minutes: 60,
        note: "internal",
        started_at: null,
        project_id: "p2",
        project: { name: "Support", hourly_rate: 5000, billable: false },
      },
    ]);
    const r = await s.call("create_invoice", {
      client: "Acme",
      from: "2026-10-01",
      to: "2026-10-31",
      issue_date: "2026-11-01",
      due_date: "2026-11-15",
    });
    expect(r.isError).toBe(false);
    expect(r.data).toMatchObject({ number: "INV-2026-003", hours: 1.5, total: 150 });
    const data = (s.prisma.invoice.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data).toMatchObject({
      user_id: "u1",
      client_id: "c1",
      number: "INV-2026-003",
      total_cents: 15000,
      total_minutes: 90,
      issue_date: "2026-11-01",
      due_date: "2026-11-15",
    });
    expect(s.prisma.invoice.findMany).toHaveBeenCalledWith({
      where: { user_id: "u1", number: { startsWith: "INV-2026-" } },
      select: { number: true },
    });
  });

  it("refuses an invoice for a client with no billable time, and one with an out-of-order period", async () => {
    s.prisma.timeEntry.findMany.mockResolvedValue([]);
    expect(
      (
        await s.call("create_invoice", {
          client: "Acme",
          from: "2026-10-01",
          to: "2026-10-31",
          issue_date: "2026-11-01",
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await s.call("create_invoice", {
          client: "Acme",
          from: "2026-10-31",
          to: "2026-10-01",
          issue_date: "2026-11-01",
        })
      ).isError,
    ).toBe(true);
    expect(s.prisma.invoice.create).not.toHaveBeenCalled();
  });

  it("finds an invoice by its number, leaves logos out, and marks it paid", async () => {
    const snapshot = {
      seller: { name: "Jo", logo: "data:image/png;base64,AAAA" },
      client: { name: "Acme", logo: "data:image/png;base64,BBBB" },
      number: "INV-2026-001",
      issueDate: "2026-11-01",
      dueDate: null,
      periodFrom: "2026-10-01",
      periodTo: "2026-10-31",
      notes: "",
      includeDetail: true,
      lines: [{ projectId: "p1", project: "Website", minutes: 90, rateCents: 10000, amountCents: 15000 }],
      detail: [{ date: "2026-10-02", project: "Website", note: "homepage", minutes: 90 }],
      totalMinutes: 90,
      totalCents: 15000,
      paymentInstructions: null,
    };
    const row = {
      id: "5b0d6b5e-5b0e-4f4e-8a40-0d3c2b1a9f10",
      client_id: "c1",
      number: "INV-2026-001",
      snapshot: JSON.stringify({
        ...snapshot,
        seller: { ...snapshot.seller, paymentInstructions: null },
        client: { ...snapshot.client, legalName: null, address: null },
      }),
    };
    s.prisma.invoice.findMany.mockResolvedValue([
      {
        ...row,
        client_name: "Acme",
        issue_date: "2026-11-01",
        due_date: null,
        paid_date: null,
        period_from: "2026-10-01",
        period_to: "2026-10-31",
        total_minutes: 90,
        total_cents: 15000,
        notes: "",
      },
    ] as never);
    s.prisma.invoice.findFirst.mockResolvedValue(row as never);

    const got = await s.call("get_invoice", { invoice: "INV-2026-001" });
    expect(got.isError).toBe(false);
    expect(got.text).not.toContain("base64");
    expect(got.text).not.toContain('"detail"');
    expect((await s.call("get_invoice", { invoice: "INV-2026-001", include_detail: true })).text).toContain('"detail"');

    const list = await s.call("list_invoices", { status: "unpaid" });
    expect(list.data).toMatchObject({ count: 1, unpaid_total: 150 });
    expect(s.prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ user_id: "u1", paid_date: null }) }),
    );

    await s.call("mark_invoice_paid", { invoice: "INV-2026-001", paid_date: "2026-11-20" });
    expect(s.prisma.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: row.id, user_id: "u1" },
      data: { paid_date: "2026-11-20" },
    });
    s.prisma.invoice.findMany.mockResolvedValue([]);
    expect((await s.call("get_invoice", { invoice: "INV-2099-999" })).text).toMatch(/No invoice numbered/);
  });

  it("helps with durations", async () => {
    expect((await s.call("parse_duration", { text: "1h30" })).data).toEqual({ minutes: 90, hours: 1.5 });
    expect((await s.call("parse_duration", { text: "banana" })).data).toMatchObject({ minutes: null });
  });

  it("reviews clients and the year, then tidies up clients, projects and an invoice", async () => {
    // Clients and billing details (the database returns logo: null for a client without one).
    s.prisma.client.findFirst.mockResolvedValue({
      id: "c1",
      name: "Acme",
      legal_name: "Acme Holdings, Inc.",
      address: "500 Market St",
      logo: null,
      invoice_every: "month",
      invoice_anchor: null,
    } as never);
    const clients = await s.call("list_clients");
    expect(clients.data?.clients).toHaveLength(2);
    expect(clients.data?.clients).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Acme", legal_name: "Acme Holdings, Inc." })]),
    );
    expect((await s.call("get_client", { client: "Acme" })).data).toMatchObject({
      id: "c1",
      legal_name: "Acme Holdings, Inc.",
      address: "500 Market St",
      has_logo: false,
      invoice_schedule: { every: "month", anchor: null },
    });

    // Hours per project: 90 minutes this month, 4 hours in all.
    s.prisma.timeEntry.groupBy
      .mockResolvedValueOnce([{ project_id: "p1", _sum: { minutes: 240 } }] as never)
      .mockResolvedValueOnce([{ project_id: "p1", _sum: { minutes: 90 } }] as never);
    const totals = await s.call("project_totals", { from: "2026-10-01", to: "2026-10-31" });
    expect(totals.data?.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ project: "Acme / Website", hours_in_range: 1.5, hours_all_time: 4 }),
      ]),
    );

    // The year: 90 billable minutes at $100/h earn $150, one invoice issued and paid.
    s.prisma.timeEntry.findMany.mockResolvedValue([{ date: "2026-10-09", minutes: 90, project_id: "p1" }] as never);
    s.prisma.project.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "Website",
        hourly_rate: 10000,
        billable: true,
        client_id: "c1",
        client: { id: "c1", name: "Acme" },
      },
    ] as never);
    s.prisma.invoice.findMany.mockResolvedValue([
      {
        number: "INV-2026-001",
        client_name: "Acme",
        issue_date: "2026-10-31",
        paid_date: "2026-11-05",
        total_cents: 15000,
        total_minutes: 90,
      },
    ] as never);
    const year = await s.call("annual_report", { year: 2026 });
    expect(year.data).toMatchObject({
      year: 2026,
      totals: { minutes: 90, earnedCents: 15000, workedDays: 1, entryCount: 1 },
      invoices: { count: 1, totalCents: 15000 },
      received: { count: 1, totalCents: 15000 },
      outstanding: { count: 0, totalCents: 0 },
    });
    expect(year.data?.months).toHaveLength(12);
    expect(year.data?.quarters).toHaveLength(4);

    // Suggested invoice number: one more than the highest used this year (INV-2026-001 above).
    expect((await s.call("next_invoice_number", { year: 2026 })).data).toEqual({ number: "INV-2026-002" });

    // Edit and archive a client: only the owner's rows are touched, the name stays.
    const edited = await s.call("update_client", { client: "Acme", address: "1 New Rd" });
    expect(edited.data).toEqual({ ok: true, client: "Acme" });
    expect(s.prisma.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1", user_id: "u1" },
        data: expect.objectContaining({ address: "1 New Rd" }),
      }),
    );
    expect((await s.call("archive_client", { client: "Globex" })).data).toEqual({ ok: true, archived: "Globex" });
    expect(s.prisma.client.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c2", user_id: "u1" }, data: { archived: true } }),
    );

    // Change a project's rate (dollars in, cents stored).
    s.prisma.project.findFirst.mockResolvedValue({ id: "p1", name: "Website", client_id: "c1" } as never);
    (s.prisma.project as Record<string, unknown>).update = vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: "p1",
        name: "Website",
        billable: true,
        ...data,
      }),
    );
    const updated = await s.call("update_project", { project: "Acme / Website", hourly_rate: 120.5 });
    expect(updated.data).toMatchObject({ project: { id: "p1", name: "Website", hourly_rate: 120.5, billable: true } });

    // Bring an archived project back: the client is restored with it.
    s.prisma.project.findMany.mockResolvedValue([
      {
        id: "p4",
        name: "Old site",
        hourly_rate: 5000,
        billable: true,
        client: { id: "c1", name: "Acme" },
      },
    ] as never);
    s.prisma.project.findFirst.mockResolvedValue({ id: "p4", client_id: "c1" } as never);
    const restored = await s.call("unarchive_project", { project: "Acme / Old site" });
    expect(restored.data).toEqual({ ok: true, restored: "Acme / Old site" });
    expect(s.prisma.client.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1", user_id: "u1" }, data: { archived: false } }),
    );

    // Delete an invoice by id: scoped to the owner.
    const invoiceId = "5b0d6b5e-5b0e-4f4e-8a40-0d3c2b1a9f10";
    expect((await s.call("delete_invoice", { invoice: invoiceId })).data).toEqual({ ok: true });
    expect(s.prisma.invoice.deleteMany).toHaveBeenCalledWith({ where: { id: invoiceId, user_id: "u1" } });
  });

  it("never shows raw database errors", async () => {
    s.prisma.timeEntry.create.mockRejectedValueOnce(new Error("SQLITE_ERROR: no such table: time_entries"));
    const r = await s.call("log_time", { project: "p1", date: "2026-10-09", minutes: 30 });
    expect(r.isError).toBe(true);
    expect(r.text).toBe("Something went wrong. Please try again.");
    expect(r.text).not.toContain("SQLITE");
  });
});

describe("a batch cannot multiply what one token may do", () => {
  const ping = (id: number) => ({ jsonrpc: "2.0", id, method: "ping" });

  it("refuses more than 20 messages in one batch, and runs none of them", async () => {
    const s = setup();
    const res = await s.http(
      Array.from({ length: 21 }, (_, i) => ({
        jsonrpc: "2.0",
        id: i + 1,
        method: "tools/call",
        params: { name: "log_time", arguments: { project: "p1", date: "2026-10-09", minutes: 5 } },
      })),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("at most 20");
    expect(s.prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it("charges every message in a batch against the token's limit", async () => {
    const s = setup();
    const batch = Array.from({ length: 20 }, (_, i) => ping(i + 1));
    // 120 calls a minute: six full batches use it all, the seventh is turned away.
    for (let i = 0; i < 6; i++) expect((await s.http(batch)).status).toBe(200);
    const blocked = await s.http(batch);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("still counts a single message as one", async () => {
    const s = setup();
    for (let i = 0; i < 120; i++) expect((await s.http(ping(i + 1))).status).toBe(200);
    expect((await s.http(ping(999))).status).toBe(429);
  });

  it("treats a token with an unexpected access value as read-only, never write", async () => {
    const s = setup({ access: "Write " });
    const me = await s.call("whoami");
    expect(me.data).toMatchObject({ token_access: "read" });
    const attempt = await s.call("delete_entry", { id: "e1" });
    expect(attempt.isError).toBe(true);
    expect(attempt.text).toContain("read-only");
    expect(s.prisma.timeEntry.deleteMany).not.toHaveBeenCalled();
  });
});

describe("timesheets", () => {
  const week = { from: "2026-10-05", to: "2026-10-11" }; // Monday to Sunday
  const projects = [
    { id: "p1", name: "Website", client_id: "c1", client: { id: "c1", name: "Acme" } },
    { id: "p3", name: "Website", client_id: "c2", client: { id: "c2", name: "Globex" } },
  ];
  const entries = [
    entryRow({ id: "a", date: "2026-10-09", minutes: 90 }),
    entryRow({ id: "b", date: "2026-10-08", minutes: 60, note: "review" }),
    entryRow({
      id: "c",
      date: "2026-10-09",
      minutes: 30,
      project_id: "p3",
      project: { id: "p3", name: "Website", client: { id: "c2", name: "Globex" } },
    }),
  ];
  const withWeek = async (access = "write") => {
    const s = setup({ access });
    s.prisma.project.findMany.mockResolvedValue(projects);
    s.prisma.timeEntry.findMany.mockResolvedValue(entries);
    return s;
  };

  it("gets the timesheet as a grid: a row per project, hours per day, totals, and the weekdays with nothing logged", async () => {
    const s = await withWeek("read"); // reading needs no write access
    const r = await s.call("get_timesheet", week);
    expect(r.data).toMatchObject({
      scope: "All clients",
      days: ["2026-10-08", "2026-10-09"],
      total_hours: 3,
      day_totals: { "2026-10-08": 1, "2026-10-09": 2 },
      weekdays_without_time: ["2026-10-05", "2026-10-06", "2026-10-07"], // the weekend is not a gap
    });
    expect((r.data as { rows: unknown[] }).rows).toEqual([
      {
        client: "Acme",
        project: "Website",
        label: "Acme / Website",
        hours_by_day: { "2026-10-08": 1, "2026-10-09": 1.5 },
        total_hours: 2.5,
      },
      {
        client: "Globex",
        project: "Website",
        label: "Globex / Website",
        hours_by_day: { "2026-10-09": 0.5 },
        total_hours: 0.5,
      },
    ]);
    expect(s.prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: "u1", date: { gte: week.from, lte: week.to } } }),
    ); // only this account, only this range
  });

  it("can narrow the grid to one client or one project", async () => {
    const s = await withWeek();
    const one = await s.call("get_timesheet", { ...week, client: "Globex" });
    expect(one.data).toMatchObject({ scope: "Globex", total_hours: 0.5 });
    expect((one.data as { rows: { client: string }[] }).rows.map((x) => x.client)).toEqual(["Globex"]);
    const proj = await s.call("get_timesheet", { ...week, project: "Acme / Website" });
    expect(proj.data).toMatchObject({ scope: "Acme / Website", total_hours: 2.5 });
  });

  it("refuses a backwards range, a range longer than a quarter, and a client that is not yours", async () => {
    const s = await withWeek();
    expect((await s.call("get_timesheet", { from: week.to, to: week.from })).isError).toBe(true);
    const long = await s.call("get_timesheet", { from: "2026-01-01", to: "2026-12-31" });
    expect(long.isError).toBe(true);
    expect(long.text).toContain("93 days");
    const stranger = await s.call("get_timesheet", { ...week, client: "Initech" });
    expect(stranger.isError).toBe(true);
    expect(stranger.text).toContain("No client matches");
  });

  it("creates a private link for a client: the token is returned once and only its hash is stored", async () => {
    const s = await withWeek();
    const r = await s.call("share_timesheet", { ...week, client: "Acme", include_notes: false, expires_in_days: 7 });
    expect(r.isError).toBe(false);
    const data = r.data as { url: string; includes_notes: boolean; expires_in_days: number };
    expect(data.url).toMatch(/\/timesheet\/[A-Za-z0-9_-]{20,}$/);
    expect(data).toMatchObject({ includes_notes: false, expires_in_days: 7 });
    const token = data.url.split("/").pop() ?? "";
    const stored = s.prisma.timesheetShare.create.mock.calls[0][0].data as {
      token_hash: string;
      user_id: string;
      snapshot: string;
    };
    expect(stored.user_id).toBe("u1");
    expect(stored.token_hash).not.toBe(token); // only a hash is kept
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.snapshot).not.toContain("review"); // notes left out when asked
    expect(s.prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: "u1", project: { client_id: "c1" } }), // Acme only
      }),
    );
  });

  it("is refused for a read-only token, for a bad lifetime, and when there is nothing to share", async () => {
    const ro = await withWeek("read");
    const refused = await ro.call("share_timesheet", week);
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("read-only");
    expect(ro.prisma.timesheetShare.create).not.toHaveBeenCalled();

    const s = await withWeek();
    expect((await s.call("share_timesheet", { ...week, expires_in_days: 10 })).isError).toBe(true);
    s.prisma.timeEntry.findMany.mockResolvedValue([]);
    const empty = await s.call("share_timesheet", week);
    expect(empty.isError).toBe(true);
    expect(empty.text).toContain("no logged time");
    expect(s.prisma.timesheetShare.create).not.toHaveBeenCalled();
  });

  it("offers a prompt that walks through building a client's timesheet and asks before sharing", async () => {
    const s = setup();
    const r = await s.rpc("prompts/get", {
      name: "client_timesheet",
      arguments: { client: "Acme", from: week.from, to: week.to },
    });
    const text = JSON.stringify(r.result);
    expect(text).toContain("get_timesheet");
    expect(text).toContain("share_timesheet");
    expect(text).toMatch(/confirm/i);
  });
});

describe("every tool's output is checked", () => {
  it("has seen a successful result from each tool, and each one matched its outputSchema", () => {
    const missing = Object.keys(OUTPUT_SCHEMAS).filter((n) => !outputChecked.has(n));
    expect(missing).toEqual([]);
  });
});
