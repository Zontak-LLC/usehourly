import { runAuditWatch } from "../../../scripts/audit-watch.mjs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A stand-in for the GitHub issues REST API on 127.0.0.1, for the audit-watch journeys. It keeps issues in memory,
 * records every request, honours `per_page`/`page`, and can be told to fail one route with a status. Nothing leaves
 * the machine.
 */
export const REPO = "zontak-ai/usehourly";
const PREFIX = `/repos/${REPO}`;

export type FakeIssue = {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: { name: string }[];
  pull_request?: { url: string };
};

export type SeenRequest = { method: string; path: string; query: URLSearchParams; body: Record<string, unknown> };

type World = {
  issues: FakeIssue[];
  comments: { number: number; body: string }[];
  seen: SeenRequest[];
  hasLabel: boolean;
  failures: Map<string, number>;
};

const servers: { close: () => void }[] = [];

/** Stops every fake API started since the last call; call it in afterEach. */
export function closeFakeGithubs() {
  for (const server of servers.splice(0)) server.close();
}

function send(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(payload));
}

function listIssues(world: World, query: URLSearchParams) {
  const perPage = Number(query.get("per_page") ?? 30);
  const page = Number(query.get("page") ?? 1);
  const label = query.get("labels");
  const matching = world.issues.filter(
    (issue) => issue.state === query.get("state") && (!label || issue.labels.some((l) => l.name === label)),
  );
  return matching.slice((page - 1) * perPage, page * perPage);
}

function issueRoute(world: World, request: SeenRequest): [number, unknown] {
  const { method, path, body } = request;
  if (method === "GET" && path === "/issues") return [200, listIssues(world, request.query)];
  if (method === "POST" && path === "/issues") {
    const issue: FakeIssue = {
      number: Math.max(100, ...world.issues.map((i) => i.number)) + 1,
      title: String(body.title),
      body: String(body.body),
      state: "open",
      labels: (body.labels as string[]).map((name) => ({ name })),
    };
    world.issues.push(issue);
    return [201, issue];
  }
  const [, number, sub] = path.match(/^\/issues\/(\d+)(\/comments)?$/) ?? [];
  const issue = world.issues.find((i) => i.number === Number(number));
  if (!issue) return [404, { message: "Not Found" }];
  if (method === "POST" && sub) {
    world.comments.push({ number: issue.number, body: String(body.body) });
    return [201, {}];
  }
  if (method === "PATCH") Object.assign(issue, body);
  return [200, issue];
}

function route(world: World, request: SeenRequest): [number, unknown] {
  const failure = world.failures.get(`${request.method} ${request.path}`);
  if (failure) return [failure, { message: "failure" }];
  if (request.path === "/labels/security") return world.hasLabel ? [200, { name: "security" }] : [404, {}];
  if (request.method === "POST" && request.path === "/labels") {
    world.hasLabel = true;
    return [201, request.body];
  }
  return issueRoute(world, request);
}

function handle(world: World, req: IncomingMessage, res: ServerResponse) {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.startsWith(PREFIX) || req.headers.authorization !== "Bearer test-token")
      return send(res, 401, { message: "Bad credentials" });
    const body = raw ? JSON.parse(raw) : {};
    const request = {
      method: req.method ?? "",
      path: url.pathname.slice(PREFIX.length),
      query: url.searchParams,
      body,
    };
    world.seen.push(request);
    const [status, payload] = route(world, request);
    send(res, status, payload);
  });
}

/** Starts a fake API holding `issues`; returns its base URL and the live world (issues, comments, requests seen). */
export async function fakeGithub({ issues = [] as FakeIssue[], hasLabel = true } = {}) {
  const world: World = { issues, comments: [], seen: [], hasLabel, failures: new Map() };
  const server = createServer((req, res) => handle(world, req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push({
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  });
  const writes = () => world.seen.filter((request) => request.method !== "GET");
  return { apiUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, world, writes };
}

/** An open issue labelled `security` with the given body. */
export function openSecurityIssue(number: number, body: string, extra: Partial<FakeIssue> = {}): FakeIssue {
  return { number, title: `issue ${number}`, body, state: "open", labels: [{ name: "security" }], ...extra };
}

const advisory = (source: number, name: string, severity: string, range: string) => ({
  source,
  name,
  dependency: name,
  title: `${name} advisory ${source}`,
  url: `https://github.com/advisories/GHSA-test-${source}`,
  severity,
  range,
});

/** npm audit v2 entries: `effect` carries a high advisory, `@prisma/config` only depends on it. */
export const EFFECT = {
  name: "effect",
  severity: "high",
  via: [advisory(1101, "effect", "high", "<=3.22.0")],
  range: "<=3.22.0",
  fixAvailable: { name: "@prisma/config", version: "7.9.0", isSemVerMajor: false },
};
export const EFFECT_PARENT = {
  name: "@prisma/config",
  severity: "high",
  via: ["effect"],
  range: ">=6.0.0",
  fixAvailable: { name: "@prisma/config", version: "7.9.0", isSemVerMajor: false },
};
export const UUID_MODERATE = {
  name: "uuid",
  severity: "moderate",
  via: [advisory(1201, "uuid", "moderate", "<11.1.1")],
  range: "<11.1.1",
  fixAvailable: true,
};
export const NEXT_HIGH = {
  name: "next",
  severity: "high",
  via: [advisory(1301, "next", "high", "<=16.4.4")],
  range: "<=16.4.4",
  fixAvailable: false,
};

/** An `npm audit --json` report text holding these entries (none = a clean audit). */
export function auditReport(...entries: { name: string }[]) {
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: Object.fromEntries(entries.map((entry) => [entry.name, entry])),
    metadata: {},
  });
}

export const chainFor = (pkg: string) => `usehourly@0.1.0\n└─┬ @prisma/config@6.19.0\n  └── ${pkg}@3.20.0`;

/** One nightly run of scripts/audit-watch.mjs against the fake API, with the audit text given and a stubbed chain. */
export function runNight(apiUrl: string, audit: string) {
  return runAuditWatch({
    readAudit: async () => audit,
    readChain: async (pkg: string) => chainFor(pkg),
    apiUrl,
    token: "test-token",
    repo: REPO,
  });
}
