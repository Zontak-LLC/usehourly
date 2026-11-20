import { expect, vi } from "vitest";

import { hashApiToken, newApiToken } from "@/lib/api-token";
import { handleMcpHttp } from "@/server/mcp/http";
import { OUTPUT_SCHEMAS } from "@/server/mcp/output-schemas";

import { withGuardedInsert } from "./guarded-insert-mock";
import { markingMock } from "./marking-mock";
import { memoryInvoiceLogos } from "./memory-invoice-logos";
import { memoryNonBillableDays } from "./memory-non-billable";
import { memoryRateLimit } from "./memory-rate-limit";

/**
 * An account with an AI assistant connected over MCP: a token, a mocked database and helpers that speak the real
 * protocol (`http`, `rpc`, `call`) through the real router. Only the database is mocked.
 */

/** Tools whose successful result has been checked against its outputSchema (see `call` in setup), per test file. */
export const outputChecked = new Set<string>();
const URL_MCP = "https://usehourly.app/api/mcp";
/** The app's own origin. */
export const APP = "https://usehourly.app";

/** The account's first client, with a billable and a non-billable project. */
export const acme = {
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

/** A stored time entry on Acme / Website; `over` changes any field. */
export const entryRow = (over: Record<string, unknown> = {}) => ({
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

/** A connected assistant with a write token unless `over` says otherwise. Returns the mocks and protocol helpers. */
export function setup(over: Partial<TokenRow> = {}) {
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
      ...markingMock(),
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
      groupBy: vi.fn(async (): Promise<unknown[]> => []),
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

/** A Monday-to-Sunday week the timesheet scenarios use. */
export const week = { from: "2026-10-05", to: "2026-10-11" };
const weekProjects = [
  { id: "p1", name: "Website", client_id: "c1", client: { id: "c1", name: "Acme" } },
  { id: "p3", name: "Website", client_id: "c2", client: { id: "c2", name: "Globex" } },
];
const weekEntries = [
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

/** `setup` with that week's entries on Acme and Globex logged. */
export const withWeek = async (access = "write") => {
  const s = setup({ access });
  s.prisma.project.findMany.mockResolvedValue(weekProjects);
  s.prisma.timeEntry.findMany.mockResolvedValue(weekEntries);
  return s;
};
