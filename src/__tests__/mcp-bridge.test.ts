import { afterEach, describe, expect, it } from "vitest";

import { mcpCatalog } from "@/server/mcp/protocol";

import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

/**
 * Someone runs UseHourly's MCP server over stdio (Claude Desktop, or Glama's container) through the
 * bridge in bridge/. These tests start the real bridge as a child process and talk to it line by line,
 * with a small local HTTP server standing in for usehourly.app.
 */

const BRIDGE_DIR = join(process.cwd(), "bridge");
const BRIDGE = join(BRIDGE_DIR, "index.mjs");
const CATALOG_FILE = join(BRIDGE_DIR, "catalog.json");
const TOKEN = "uh_test_token_1234567890abcdefghijklmnopqrstuv";

type Rpc = {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

/** The bridge gets only PATH plus what the scenario sets, never the developer's own token. */
const cleanEnv = (extra: Record<string, string>) =>
  ({ PATH: process.env.PATH ?? "", ...extra }) as unknown as NodeJS.ProcessEnv;

/** Run the bridge, feed it these lines, wait for it to finish, return what it printed. */
async function runBridge(lines: (object | string)[], env: Record<string, string>) {
  const child: ChildProcess = spawn(process.execPath, [BRIDGE], {
    env: cleanEnv(env),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  child.stdout?.on("data", (d) => {
    out += d;
  });
  child.stderr?.on("data", (d) => {
    err += d;
  });
  const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
  for (const l of lines) child.stdin?.write(`${typeof l === "string" ? l : JSON.stringify(l)}\n`);
  child.stdin?.end();
  const code = await exited;
  const rawLines = out.split("\n").filter(Boolean);
  // Stdout is the protocol channel: every line must be JSON.
  const messages = rawLines.map((l) => JSON.parse(l) as Rpc | Rpc[]);
  const byId = (id: number | string) => messages.flat().find((m) => m.id === id) as Rpc;
  return { code, out, err, messages, byId };
}

type Seen = { method?: string; auth?: string; body: Record<string, unknown> };

/** A stand-in for the hosted server: records requests, answers with `respond`. */
async function fakeRemote(
  respond: (
    body: Record<string, unknown>,
    req: IncomingMessage,
  ) => { status: number; json: unknown; headers?: Record<string, string> },
) {
  const seen: Seen[] = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => {
      raw += d;
    });
    req.on("end", () => {
      const body = JSON.parse(raw || "{}") as Record<string, unknown>;
      seen.push({ method: req.method, auth: req.headers.authorization, body });
      const r = respond(body, req);
      res.writeHead(r.status, { "content-type": "application/json", ...(r.headers ?? {}) });
      res.end(JSON.stringify(r.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/mcp`;
  return { url, seen, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

let remote: Awaited<ReturnType<typeof fakeRemote>> | undefined;
afterEach(async () => {
  await remote?.close();
  remote = undefined;
});

const echoOk = (body: Record<string, unknown>) => ({
  status: 200,
  json: { jsonrpc: "2.0", id: body.id, result: { echoed: body.method, params: body.params } },
});

describe("the catalog the bridge ships", () => {
  it("is exactly what the server advertises, so the offline lists never drift", () => {
    const fresh = JSON.parse(JSON.stringify(mcpCatalog()));
    if (process.env.UPDATE_MCP_CATALOG) writeFileSync(CATALOG_FILE, `${JSON.stringify(fresh, null, 2)}\n`);
    const shipped = JSON.parse(readFileSync(CATALOG_FILE, "utf8"));
    expect(shipped, "bridge/catalog.json is stale: run `npm run mcp:catalog`").toEqual(fresh);
    expect(shipped.tools).toHaveLength(30);
    expect(shipped.resources).toHaveLength(2);
    expect(shipped.resourceTemplates).toHaveLength(1);
    expect(shipped.prompts).toHaveLength(3);
  });
});

describe("a client connects over stdio", () => {
  it("handshakes and lists everything without a token or a network", async () => {
    remote = await fakeRemote(echoOk);
    const r = await runBridge(
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {} } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
        { jsonrpc: "2.0", id: 3, method: "resources/list" },
        { jsonrpc: "2.0", id: 4, method: "resources/templates/list" },
        { jsonrpc: "2.0", id: 5, method: "prompts/list" },
        { jsonrpc: "2.0", id: 6, method: "ping" },
        { jsonrpc: "2.0", id: 7, method: "initialize", params: { protocolVersion: "1999-01-01" } },
      ],
      { USEHOURLY_MCP_URL: remote.url },
    );
    expect(r.code).toBe(0);
    expect(r.byId(1).result).toMatchObject({
      protocolVersion: "2025-03-26",
      serverInfo: { name: "usehourly", title: "UseHourly" },
      capabilities: { tools: {}, resources: {}, prompts: {} },
    });
    expect(String(r.byId(1).result?.instructions)).toContain("UseHourly tracks a freelancer's time");
    expect(r.byId(7).result).toMatchObject({ protocolVersion: "2025-06-18" }); // unknown ask: newest we speak
    const tools = r.byId(2).result?.tools as { name: string; inputSchema: object; outputSchema: object }[];
    expect(tools).toHaveLength(30);
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["log_time", "create_invoice", "annual_report"]));
    for (const t of tools) {
      expect(t.inputSchema).toMatchObject({ type: "object" });
      expect(t.outputSchema).toMatchObject({ type: "object" });
    }
    expect(r.byId(3).result?.resources).toHaveLength(2);
    expect(r.byId(4).result?.resourceTemplates).toHaveLength(1);
    expect(r.byId(5).result?.prompts).toHaveLength(3);
    expect(r.byId(6).result).toEqual({});
    // The notification got no reply, and none of this touched the network.
    expect(r.messages).toHaveLength(7);
    expect(remote.seen).toHaveLength(0);
  });

  it("answers bad lines the JSON-RPC way and keeps going", async () => {
    const r = await runBridge(
      [
        "this is not json",
        { jsonrpc: "2.0", id: 1, method: "tools/nope" },
        { hello: "world", id: 2 },
        [],
        [
          { jsonrpc: "2.0", id: 3, method: "ping" },
          { jsonrpc: "2.0", id: 4, method: "prompts/list" },
        ],
        { jsonrpc: "2.0", id: 5, method: "ping" },
      ],
      {},
    );
    expect(r.code).toBe(0);
    expect(r.messages[0]).toMatchObject({ id: null, error: { code: -32700 } });
    expect(r.byId(1).error).toMatchObject({ code: -32601 });
    expect(r.byId(2).error).toMatchObject({ code: -32600 });
    expect(r.messages.some((m) => !Array.isArray(m) && m.id === null && m.error?.code === -32600)).toBe(true);
    const batch = r.messages.find((m) => Array.isArray(m)) as Rpc[];
    expect(batch.map((m) => m.id).sort()).toEqual([3, 4]);
    expect(r.byId(5).result).toEqual({});
  });

  it("prints its version and help without starting", async () => {
    for (const flag of ["--version", "--help"]) {
      const child = spawn(process.execPath, [BRIDGE, flag], { env: cleanEnv({}) });
      let out = "";
      child.stdout.on("data", (d) => {
        out += d;
      });
      const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
      expect(code).toBe(0);
      expect(out).toContain(flag === "--version" ? "1.0.0" : "USEHOURLY_API_TOKEN");
    }
  });
});

describe("work is forwarded to the hosted server as the token's owner", () => {
  it("sends tools/call, resources/read and prompts/get with the bearer token and keeps ids straight", async () => {
    remote = await fakeRemote(echoOk);
    const r = await runBridge(
      [
        {
          jsonrpc: "2.0",
          id: "a",
          method: "tools/call",
          params: { name: "log_time", arguments: { project: "Acme / Website", date: "2026-10-09", minutes: 90 } },
        },
        { jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "usehourly://projects" } },
        {
          jsonrpc: "2.0",
          id: 3,
          method: "prompts/get",
          params: { name: "week_summary", arguments: { week_start: "2026-10-05" } },
        },
      ],
      { USEHOURLY_MCP_URL: remote.url, USEHOURLY_API_TOKEN: ` ${TOKEN} ` },
    );
    expect(r.code).toBe(0);
    expect(remote.seen).toHaveLength(3);
    for (const s of remote.seen) {
      expect(s.method).toBe("POST");
      expect(s.auth).toBe(`Bearer ${TOKEN}`);
    }
    const sent = Object.fromEntries(remote.seen.map((s) => [String(s.body.id), s.body]));
    expect(sent.a).toMatchObject({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "log_time", arguments: { project: "Acme / Website", date: "2026-10-09", minutes: 90 } },
    });
    expect(r.byId("a").result).toMatchObject({ echoed: "tools/call" });
    expect(r.byId(2).result).toMatchObject({ echoed: "resources/read", params: { uri: "usehourly://projects" } });
    expect(r.byId(3).result).toMatchObject({ echoed: "prompts/get" });
  });

  it("passes the server's own errors through untouched, under the caller's id", async () => {
    remote = await fakeRemote(() => ({
      status: 200,
      json: {
        jsonrpc: "2.0",
        id: 999,
        result: { content: [{ type: "text", text: 'No project matches "Nope".' }], isError: true },
      },
    }));
    const r = await runBridge(
      [{ jsonrpc: "2.0", id: 41, method: "tools/call", params: { name: "log_time", arguments: {} } }],
      { USEHOURLY_MCP_URL: remote.url, USEHOURLY_API_TOKEN: TOKEN },
    );
    expect(r.byId(41).result).toEqual({
      content: [{ type: "text", text: 'No project matches "Nope".' }],
      isError: true,
    });
  });
});

describe("when something is wrong the assistant is told in plain words", () => {
  it("explains a missing token without calling the server", async () => {
    remote = await fakeRemote(echoOk);
    const r = await runBridge(
      [
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } },
        { jsonrpc: "2.0", id: 2, method: "prompts/get", params: { name: "week_summary" } },
      ],
      { USEHOURLY_MCP_URL: remote.url },
    );
    const call = r.byId(1).result as { isError: boolean; content: { text: string }[] };
    expect(call.isError).toBe(true);
    expect(call.content[0].text).toContain("USEHOURLY_API_TOKEN");
    expect(r.byId(2).error).toMatchObject({ code: -32602 });
    expect(r.byId(2).error?.message).toContain("USEHOURLY_API_TOKEN");
    expect(remote.seen).toHaveLength(0);
  });

  it("explains a rejected token, a throttled one and an unexpected reply", async () => {
    for (const [status, expected] of [
      [401, "rejected the token"],
      [429, "going too fast"],
      [502, "HTTP 502"],
    ] as const) {
      remote = await fakeRemote(() => ({ status, json: { error: "x" } }));
      const r = await runBridge(
        [{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }],
        { USEHOURLY_MCP_URL: remote.url, USEHOURLY_API_TOKEN: TOKEN },
      );
      const res = r.byId(1).result as { isError: boolean; content: { text: string }[] };
      expect(res.isError, `status ${status}`).toBe(true);
      expect(res.content[0].text).toContain(expected);
      await remote.close();
      remote = undefined;
    }
  });

  it("explains an unreachable server and never leaks the token", async () => {
    const r = await runBridge(
      [{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }],
      { USEHOURLY_MCP_URL: "http://127.0.0.1:1/api/mcp", USEHOURLY_API_TOKEN: TOKEN },
    );
    const res = r.byId(1).result as { isError: boolean; content: { text: string }[] };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Couldn't reach UseHourly");
    expect(r.out).not.toContain(TOKEN);
    expect(r.err).not.toContain(TOKEN);
  });
});

describe("the token only ever goes somewhere safe", () => {
  it("refuses to start when the address is plain http on another machine, or not an address at all", async () => {
    for (const url of ["http://example.com/api/mcp", "ftp://example.com/x", "not a url"]) {
      const r = await runBridge([{ jsonrpc: "2.0", id: 1, method: "ping" }], {
        USEHOURLY_MCP_URL: url,
        USEHOURLY_API_TOKEN: TOKEN,
      });
      expect(r.code, url).toBe(1);
      expect(r.out, url).toBe(""); // nothing on the protocol channel
      expect(r.err, url).toContain("USEHOURLY_MCP_URL");
      expect(r.err).not.toContain(TOKEN);
    }
  });

  it("accepts https and loopback http, and still answers the offline handshake", async () => {
    remote = await fakeRemote(echoOk);
    const r = await runBridge([{ jsonrpc: "2.0", id: 1, method: "ping" }], {
      USEHOURLY_MCP_URL: remote.url, // http://127.0.0.1:<port>
      USEHOURLY_API_TOKEN: TOKEN,
    });
    expect(r.code).toBe(0);
    expect(r.byId(1).result).toEqual({});
    const secure = await runBridge([{ jsonrpc: "2.0", id: 1, method: "ping" }], {
      USEHOURLY_MCP_URL: "https://usehourly.app/api/mcp",
    });
    expect(secure.code).toBe(0);
  });

  it("does not follow a redirect, so the token never reaches the address it points to", async () => {
    const elsewhere = await fakeRemote(echoOk);
    remote = await fakeRemote(() => ({ status: 302, json: {}, headers: { location: elsewhere.url } }));
    const r = await runBridge(
      [{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }],
      { USEHOURLY_MCP_URL: remote.url, USEHOURLY_API_TOKEN: TOKEN },
    );
    const res = r.byId(1).result as { isError: boolean; content: { text: string }[] };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Couldn't reach UseHourly");
    expect(remote.seen).toHaveLength(1);
    expect(elsewhere.seen).toHaveLength(0); // the other address never saw a request, let alone the token
    await elsewhere.close();
  });

  it("no longer tells anyone to run an unpublished package", () => {
    const readme = readFileSync(join(BRIDGE_DIR, "README.md"), "utf8");
    const bridge = readFileSync(BRIDGE, "utf8");
    expect(readme).not.toMatch(/"command":\s*"npx"/);
    expect(bridge).not.toMatch(/"npx"/);
    expect(readme).toContain("bridge/index.mjs");
  });
});
