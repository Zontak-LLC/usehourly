#!/usr/bin/env node
// stdio bridge for the UseHourly MCP server.
//
// Speaks MCP over stdin/stdout (one JSON message per line) and talks to the hosted server over HTTP.
// The handshake and the tool/resource/prompt lists are answered locally from catalog.json, so a client
// can inspect the server without a working token. Real work (tools/call, resources/read, prompts/get)
// is forwarded to the hosted endpoint with USEHOURLY_API_TOKEN as the bearer token.
//
// No dependencies: Node 18+ only. stdout carries protocol messages only; logs go to stderr.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(here, "catalog.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));

const ENDPOINT = process.env.USEHOURLY_MCP_URL || "https://usehourly.app/api/mcp";
const TOKEN = (process.env.USEHOURLY_API_TOKEN || "").trim();
const TIMEOUT_MS = 60_000;

const ERR = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602 };

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(pkg.version);
  process.exit(0);
}
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    [
      `usehourly-mcp ${pkg.version}: stdio bridge to ${ENDPOINT}`,
      "",
      "Set USEHOURLY_API_TOKEN to a token from UseHourly > Account > AI assistants.",
      "Optional: USEHOURLY_MCP_URL to point at another server.",
      "",
      'Example (Claude Desktop): { "command": "npx", "args": ["-y", "usehourly-mcp"],',
      '  "env": { "USEHOURLY_API_TOKEN": "uh_..." } }',
    ].join("\n"),
  );
  process.exit(0);
}

// The token goes to this address in a header, so it must be one that cannot be read on the way: https, or
// a program on this same machine.
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
function endpointProblem(address) {
  let url;
  try {
    url = new URL(address);
  } catch {
    return `USEHOURLY_MCP_URL is not a valid address: ${address}`;
  }
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && LOOPBACK.has(url.hostname)) return null;
  return "USEHOURLY_MCP_URL must start with https:// (plain http is allowed only for localhost).";
}
const badEndpoint = endpointProblem(ENDPOINT);
if (badEndpoint) {
  console.error(`usehourly-mcp: ${badEndpoint}`);
  process.exit(1);
}

const reply = (id, result) => ({ jsonrpc: "2.0", id, result });
const failure = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
const toolError = (id, text) => reply(id, { content: [{ type: "text", text }], isError: true });

/** A problem reaching or using the hosted server, shaped for the kind of request it came from. */
function problem(msg, text) {
  return msg.method === "tools/call" ? toolError(msg.id, text) : failure(msg.id, ERR.invalidParams, text);
}

/** Forward one request to the hosted server and give its answer back under the caller's id. */
async function forward(msg) {
  if (!TOKEN) {
    return problem(
      msg,
      "No token set. Make one in UseHourly under Account > AI assistants and pass it as USEHOURLY_API_TOKEN.",
    );
  }
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      redirect: "error", // never follow a redirect with the token attached
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${TOKEN}`,
        "user-agent": `usehourly-mcp/${pkg.version}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: msg.id, method: msg.method, params: msg.params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error("usehourly-mcp: request failed:", e instanceof Error ? e.message : e);
    return problem(msg, `Couldn't reach UseHourly at ${ENDPOINT}. Check the connection and try again.`);
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // not JSON: fall through to the status-based messages below
  }
  // Only a real JSON-RPC reply is passed through; the server's plain { error } bodies (401, 403, 413,
  // 429) fall through to the status-based messages.
  if (body && typeof body === "object" && body.jsonrpc === "2.0" && ("result" in body || "error" in body)) {
    return { ...body, id: msg.id };
  }
  if (res.status === 401 || res.status === 403) {
    return problem(
      msg,
      "UseHourly rejected the token (revoked, expired, or mistyped). Make a new one under Account > AI assistants.",
    );
  }
  if (res.status === 429) return problem(msg, "UseHourly says you are going too fast. Wait a minute and try again.");
  return problem(msg, `UseHourly answered with an unexpected response (HTTP ${res.status}).`);
}

async function handle(msg) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || typeof msg.method !== "string") {
    const id =
      msg && typeof msg === "object" && (typeof msg.id === "string" || typeof msg.id === "number") ? msg.id : null;
    // Responses to requests we never sent need no answer.
    if (msg && typeof msg === "object" && ("result" in msg || "error" in msg)) return null;
    return failure(id, ERR.invalidRequest, "Not a valid JSON-RPC 2.0 request.");
  }
  if (msg.id === undefined) return null; // a notification (initialized, cancelled, ...): nothing to say

  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      const version = catalog.protocolVersions.includes(asked) ? asked : catalog.protocolVersions[0];
      return reply(msg.id, {
        protocolVersion: version,
        capabilities: catalog.capabilities,
        serverInfo: catalog.serverInfo,
        instructions: catalog.instructions,
      });
    }
    case "ping":
    case "logging/setLevel":
      return reply(msg.id, {});
    case "tools/list":
      return reply(msg.id, { tools: catalog.tools });
    case "resources/list":
      return reply(msg.id, { resources: catalog.resources });
    case "resources/templates/list":
      return reply(msg.id, { resourceTemplates: catalog.resourceTemplates });
    case "prompts/list":
      return reply(msg.id, { prompts: catalog.prompts });
    case "tools/call":
    case "resources/read":
    case "prompts/get":
      return forward(msg);
    default:
      return failure(msg.id, ERR.methodNotFound, `Method not found: ${msg.method}`);
  }
}

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

const pending = new Set();
function track(promise) {
  pending.add(promise);
  promise.finally(() => pending.delete(promise));
}

async function onLine(line) {
  const text = line.trim();
  if (!text) return;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    send(failure(null, ERR.parse, "Parse error: that line is not valid JSON."));
    return;
  }
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return send(failure(null, ERR.invalidRequest, "Empty batch."));
    const out = (await Promise.all(parsed.map(handle))).filter(Boolean);
    if (out.length) send(out);
    return;
  }
  const out = await handle(parsed);
  if (out) send(out);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => track(onLine(line)));
rl.on("close", async () => {
  await Promise.allSettled([...pending]);
  process.exit(0);
});
