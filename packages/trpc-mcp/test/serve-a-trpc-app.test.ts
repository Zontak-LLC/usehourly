import { initTRPC, TRPCError } from "@trpc/server";
import {
  type AuthOutcome,
  catalogProblems,
  createMcpHttpHandler,
  createMcpServer,
  defineTool,
  type McpToolDef,
} from "trpc-mcp-server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * The package's own scenario: a tiny tRPC notes app (not UseHourly) is served to an assistant.
 * This is the test of the public API: what another app (Duely, Tenderly) would write.
 */

type Note = { id: number; owner: string; text: string };

function notesApp() {
  const notes: Note[] = [
    { id: 1, owner: "ana", text: "Ana's plan" },
    { id: 2, owner: "ben", text: "Ben's secret" },
  ];
  const t = initTRPC.context<{ userId: string | null }>().create();
  const authed = t.procedure.use(({ ctx, next }) => {
    if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
    return next({ ctx: { userId: ctx.userId } });
  });
  const create = vi.fn((owner: string, text: string) => {
    const note = { id: notes.length + 1, owner, text };
    notes.push(note);
    return note;
  });
  const router = t.router({
    // The ownership filter lives in the procedure, so a tool can never bypass it.
    list: authed.query(({ ctx }) => notes.filter((n) => n.owner === ctx.userId)),
    get: authed.input(z.object({ id: z.number() })).query(({ ctx, input }) => {
      const n = notes.find((x) => x.id === input.id && x.owner === ctx.userId);
      if (!n) throw new TRPCError({ code: "NOT_FOUND", message: "No such note." });
      return n;
    }),
    add: authed
      .input(z.object({ text: z.string().min(1) }))
      .mutation(({ ctx, input }) => create(ctx.userId, input.text)),
    boom: authed.query(() => {
      throw new Error("SQLITE_ERROR: table notes is locked at 0x7f");
    }),
  });
  const caller = t.createCallerFactory(router);
  return { notes, create, caller };
}

type Ctx = { userId: string; access: "read" | "write"; tokenId: string };

function setup(LIMIT = 100) {
  const app = notesApp();
  const as = (ctx: Ctx) => app.caller({ userId: ctx.userId });
  const noteShape = z.object({ id: z.number(), text: z.string() });
  const tools: McpToolDef<Ctx>[] = [
    defineTool({
      name: "list_notes",
      title: "List notes",
      description: "Your notes.",
      access: "read",
      input: z.object({}),
      output: z.object({ notes: z.array(noteShape) }),
      run: async (_args: object, ctx: Ctx) => ({ notes: await as(ctx).list() }),
    }),
    defineTool({
      name: "get_note",
      title: "Get a note",
      description: "One note by id.",
      access: "read",
      input: z.object({ id: z.number().describe("The note's id") }),
      output: noteShape,
      run: async (args: { id: number }, ctx: Ctx) => as(ctx).get({ id: args.id }),
    }),
    defineTool({
      name: "add_note",
      title: "Add a note",
      description: "Saves a note.",
      access: "write",
      input: z.object({ text: z.string().min(1).describe("What to write") }),
      output: noteShape,
      run: async (args: { text: string }, ctx: Ctx) => as(ctx).add(args),
    }),
    defineTool({
      name: "boom",
      title: "Fails",
      description: "Always fails inside.",
      access: "read",
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      run: async (_args: object, ctx: Ctx) => as(ctx).boom(),
    }),
  ];
  const internal = vi.fn();
  const server = createMcpServer<Ctx>({
    info: { name: "notes", version: "0.1.0" },
    instructions: "Notes for one person.",
    tools,
    resources: [{ uri: "notes://all", name: "all" }],
    readResource: async (uri, ctx) => {
      if (uri !== "notes://all") throw new TRPCError({ code: "NOT_FOUND", message: `Unknown resource ${uri}.` });
      return as(ctx).list();
    },
    prompts: [
      {
        name: "jot",
        title: "Jot",
        description: "Write a note",
        arguments: [{ name: "what", description: "The note", required: true }],
        build: (a) => `Add a note: ${a.what}`,
      },
    ],
    describeError: (e) =>
      e instanceof TRPCError && e.code !== "INTERNAL_SERVER_ERROR" ? e.message : "Something went wrong.",
    onInternalError: internal,
    maxBatch: 3,
  });

  const tokens: Record<string, Ctx> = {
    "tok-ana-write": { userId: "ana", access: "write", tokenId: "t1" },
    "tok-ana-read": { userId: "ana", access: "read", tokenId: "t2" },
    "tok-ben-write": { userId: "ben", access: "write", tokenId: "t3" },
  };
  const spent = new Map<string, number>();
  const http = createMcpHttpHandler<Ctx>({
    server,
    appUrl: "https://notes.example",
    authenticate: async (req): Promise<AuthOutcome<Ctx>> => {
      const ctx = tokens[(req.headers.get("authorization") ?? "").replace(/^Bearer /, "")];
      return ctx
        ? { ok: true, ctx }
        : { ok: false, status: 401, message: "Bad token.", headers: { "www-authenticate": "Bearer" } };
    },
    rateLimit: async (ctx, cost) => {
      const used = (spent.get(ctx.tokenId) ?? 0) + cost;
      spent.set(ctx.tokenId, used);
      return used > LIMIT ? { allowed: false, retryAfterSeconds: 60 } : { allowed: true };
    },
  });

  let id = 0;
  async function post(body: unknown, token = "tok-ana-write", headers: Record<string, string> = {}) {
    const res = await http(
      new Request("https://notes.example/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, host: "notes.example", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
  }
  const rpc = async (method: string, params?: unknown, token?: string) =>
    (await post({ jsonrpc: "2.0", id: ++id, method, ...(params !== undefined && { params }) }, token)).json;
  const call = async (name: string, args: unknown, token?: string) =>
    (await rpc("tools/call", { name, arguments: args }, token)).result;
  return { app, server, http, post, rpc, call, internal, spent };
}

describe("an assistant connects to a tRPC app through the package", () => {
  it("hands over the catalog: version, tools with schemas and honest hints, resources, prompts", async () => {
    const s = setup();
    const init = await s.rpc("initialize", { protocolVersion: "2025-03-26" });
    expect(init.result).toMatchObject({
      protocolVersion: "2025-03-26",
      serverInfo: { name: "notes", version: "0.1.0" },
      instructions: "Notes for one person.",
    });
    expect(Object.keys(init.result.capabilities).sort()).toEqual(["prompts", "resources", "tools"]);
    expect((await s.rpc("initialize", { protocolVersion: "1999-01-01" })).result.protocolVersion).toBe("2025-06-18");

    const { tools } = (await s.rpc("tools/list")).result;
    const by = Object.fromEntries(tools.map((t: { name: string }) => [t.name, t]));
    expect(by.get_note.inputSchema).toMatchObject({
      type: "object",
      properties: { id: { type: "number", description: "The note's id" } },
      required: ["id"],
    });
    expect(by.get_note.outputSchema.type).toBe("object");
    expect(by.list_notes.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(by.add_note.annotations).toMatchObject({ readOnlyHint: false });
    expect(s.server.catalog().tools).toEqual(tools);

    const prompt = await s.rpc("prompts/get", { name: "jot", arguments: { what: "milk" } });
    expect(prompt.result.messages[0].content.text).toBe("Add a note: milk");
    expect((await s.rpc("prompts/get", { name: "jot" })).error).toMatchObject({ code: -32602 });
    const res = await s.rpc("resources/read", { uri: "notes://all" });
    expect(JSON.parse(res.result.contents[0].text)).toEqual([{ id: 1, owner: "ana", text: "Ana's plan" }]);
    expect((await s.rpc("resources/read", { uri: "notes://nope" })).error.message).toBe(
      "Unknown resource notes://nope.",
    );
  });

  it("runs every tool as the token's owner, so the app's own filters keep accounts apart", async () => {
    const s = setup();
    expect((await s.call("list_notes", {})).structuredContent).toEqual({
      notes: [{ id: 1, owner: "ana", text: "Ana's plan" }],
    });
    const stolen = await s.call("get_note", { id: 2 });
    expect(stolen).toMatchObject({ isError: true, content: [{ text: "No such note." }] });
    expect(JSON.stringify(stolen)).not.toContain("secret");
    expect((await s.call("get_note", { id: 2 }, "tok-ben-write")).structuredContent).toMatchObject({
      text: "Ben's secret",
    });

    const added = await s.call("add_note", { text: "Call the bank" });
    expect(added.isError).toBe(false);
    expect(s.app.create).toHaveBeenCalledWith("ana", "Call the bank");
    expect(s.app.notes.at(-1)).toEqual({ id: 3, owner: "ana", text: "Call the bank" });
  });

  it("refuses a write tool to a read-only token before the procedure runs", async () => {
    const s = setup();
    const out = await s.call("add_note", { text: "sneaky" }, "tok-ana-read");
    expect(out).toMatchObject({ isError: true });
    expect(out.content[0].text).toMatch(/read-only/);
    expect(s.app.create).not.toHaveBeenCalled();
    expect(s.app.notes).toHaveLength(2);
  });

  it("checks arguments against the schema and never calls the procedure with bad ones", async () => {
    const s = setup();
    const out = await s.call("add_note", { text: "" });
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toMatch(/^Invalid arguments\. text: /);
    expect(s.app.create).not.toHaveBeenCalled();
    expect((await s.rpc("tools/call", { name: "nope", arguments: {} })).error).toMatchObject({ code: -32602 });
    expect((await s.rpc("tools/call", { arguments: {} })).error.code).toBe(-32602);
  });

  it("keeps raw internal errors on the server", async () => {
    const s = setup();
    const out = await s.call("boom", {});
    expect(out).toMatchObject({ isError: true, content: [{ text: "Something went wrong." }] });
    expect(JSON.stringify(out)).not.toMatch(/SQLITE|0x7f/);
  });
});

describe("the HTTP door", () => {
  it("answers only POST, refuses foreign web pages, bad tokens, huge and broken bodies", async () => {
    const s = setup();
    const get = await s.http(new Request("https://notes.example/mcp"));
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");

    const foreign = await s.post({ jsonrpc: "2.0", id: 1, method: "ping" }, undefined, {
      origin: "https://evil.example",
    });
    expect(foreign.status).toBe(403);
    const own = await s.post({ jsonrpc: "2.0", id: 1, method: "ping" }, undefined, { origin: "https://notes.example" });
    expect(own.status).toBe(200);

    const bad = await s.post({ jsonrpc: "2.0", id: 1, method: "ping" }, "tok-nobody");
    expect(bad.status).toBe(401);
    expect(bad.headers.get("www-authenticate")).toBe("Bearer");
    expect(bad.json).toEqual({ error: "Bad token." });

    expect((await s.post("x".repeat(300 * 1024))).status).toBe(413);
    const broken = await s.post("{not json");
    expect(broken.status).toBe(400);
    expect(broken.json.error.code).toBe(-32700);
  });

  it("counts every message in a batch against the limit and caps the batch size", async () => {
    const s = setup(7);
    const ping = (n: number) => ({ jsonrpc: "2.0", id: n, method: "ping" });
    const three = await s.post([ping(1), ping(2), ping(3)]);
    expect(three.status).toBe(200);
    expect(three.json).toHaveLength(3);
    expect(s.spent.get("t1")).toBe(3);

    const tooMany = await s.post([ping(1), ping(2), ping(3), ping(4)]);
    expect(tooMany.status).toBe(400);
    expect(tooMany.json.error.message).toMatch(/at most 3/);
    expect(s.spent.get("t1")).toBe(7);
    const limited = await s.post(ping(9));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");

    const note = await s.post({ jsonrpc: "2.0", method: "notifications/initialized" }, "tok-ben-write");
    expect(note.status).toBe(202);
    expect(note.json).toBeNull();
    expect((await s.post([], "tok-ben-write")).status).toBe(400);
  });
});

describe("a catalog that is not fit to publish", () => {
  const base = {
    name: "x",
    title: "X",
    description: "Does x.",
    access: "read" as const,
    input: z.object({ a: z.string() }),
    output: z.object({ ok: z.boolean() }),
    run: async () => ({ ok: true }),
  };

  it("names undocumented parameters, duplicates and non-object results", () => {
    expect(
      catalogProblems([
        base,
        { ...base, input: z.object({ a: z.string().describe("A") }) },
        { ...base, name: "y", description: " ", input: z.object({}), output: z.array(z.string()) },
      ]),
    ).toEqual([
      'Tool "x" parameter "a" has no description.',
      'Tool "x" is listed twice.',
      'Tool "y" has no description.',
      'Tool "y" must return an object.',
    ]);
  });

  it("refuses to start a server with a tool that has no output schema", () => {
    expect(() =>
      createMcpServer({
        info: { name: "x", version: "1" },
        tools: [{ ...base, output: undefined as never }],
        describeError: String,
      }),
    ).toThrow(/no output schema/);
  });
});
