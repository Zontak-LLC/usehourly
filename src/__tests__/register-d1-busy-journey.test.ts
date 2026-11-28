import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { D1_BUSY_MESSAGE, isD1Overloaded } from "@/lib/d1-busy";
import { enforceRequestLimits } from "@/lib/request-limits";
import { handleTrpc } from "@/server/trpc-handler";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

const OVERLOADED =
  "\nInvalid `prisma.rateLimit.update()` invocation:\n\n\nDatabase error. Code: `N/A`. Message: `D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window.`";
const IP = "203.0.113.7";
const BODY = { name: "Ann", email: "ann@example.com", password: "FAKE-password-1234" };
const FAR_FUTURE = 4_000_000_000;

function memoryDb() {
  return {
    ...memoryRateLimit(),
    authUser: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({ id: "u1" })) },
  };
}
type Db = ReturnType<typeof memoryDb>;

const signUp = (db: Db) =>
  handleTrpc(
    new Request("https://staging.usehourly.app/api/trpc/account.register", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": IP },
      body: JSON.stringify(BODY),
    }),
    async () => {
      await enforceRequestLimits(db as never, { method: "POST", ip: IP });
      return { session: null, prisma: db as never, ip: IP };
    },
  );

let db: Db;
let logs: string[];
const lines = () => logs.map((l) => JSON.parse(l) as { event: string; level: string; [k: string]: unknown });
const events = () => lines().map((l) => l.event);

beforeEach(() => {
  db = memoryDb();
  logs = [];
  vi.spyOn(console, "error").mockImplementation((line: string) => {
    logs.push(line);
  });
});
afterEach(() => vi.restoreAllMocks());

async function expectBusy(res: Response, where: string) {
  expect(res.status).toBe(503);
  const body = (await res.json()) as { error: { message: string } };
  expect(body.error.message).toBe(D1_BUSY_MESSAGE);
  expect(D1_BUSY_MESSAGE).toBe("UseHourly is busy right now. Please try again in a few seconds.");
  expect(db.authUser.findUnique).not.toHaveBeenCalled();
  expect(db.authUser.create).not.toHaveBeenCalled();
  const warns = lines().filter((l) => l.event === "d1_overloaded");
  expect(warns).toHaveLength(1);
  expect(warns[0].level).toBe("warn");
  expect(Object.keys(warns[0]).sort()).toEqual(["event", "level", "message", "time", "where"]);
  expect(warns[0].where).toBe(where);
  expect(logs.join("\n")).not.toContain(IP);
  expect(logs.join("\n")).not.toContain(BODY.email);
  expect(logs.join("\n")).not.toContain(BODY.password);
  expect(events()).not.toContain("trpc_internal_error");
}

describe("sign-up while D1 is overloaded", () => {
  it("answers 503 when the write:ip counter (updateMany) is refused, and sends it once", async () => {
    db.rateLimit.updateMany.mockRejectedValue(new Error(OVERLOADED));
    await expectBusy(await signUp(db), "write_limit");
    expect(db.rateLimit.updateMany).toHaveBeenCalledTimes(1);
    expect(db.rateLimit.update).not.toHaveBeenCalled();
  });

  it("answers 503 when the register:<ip> counter (update) is refused, and sends it once", async () => {
    db.rows.set(`register:${IP}`, { key: `register:${IP}`, count: 1, reset_at: FAR_FUTURE });
    const original = db.rateLimit.update.getMockImplementation();
    db.rateLimit.update.mockImplementation(async (args) => {
      if (args.where.key.startsWith("register:")) throw new Error(OVERLOADED);
      return original?.(args) as never;
    });
    await expectBusy(await signUp(db), "register_limit");
    const registerUpdates = db.rateLimit.update.mock.calls.filter((c) => c[0].where.key.startsWith("register:"));
    expect(registerUpdates).toHaveLength(1);
  });

  it("any other counter error still answers 500 and logs trpc_internal_error", async () => {
    db.rateLimit.updateMany.mockRejectedValue(new Error("D1_ERROR: no such table: rate_limits"));
    const res = await signUp(db);
    expect(res.status).toBe(500);
    expect(events()).toContain("trpc_internal_error");
    expect(events()).not.toContain("d1_overloaded");
    expect(db.authUser.create).not.toHaveBeenCalled();
  });
});

describe("isD1Overloaded", () => {
  it("is true for an Error carrying the D1 text", () => {
    expect(isD1Overloaded(new Error(OVERLOADED))).toBe(true);
  });
  it("is true when a cause holds the text", () => {
    expect(isD1Overloaded(new Error("wrapped", { cause: new Error("D1_ERROR: D1 DB is overloaded.") }))).toBe(true);
  });
  it("is false for an unrelated message and for non-errors", () => {
    expect(isD1Overloaded(new Error("D1_ERROR: no such table: rate_limits"))).toBe(false);
    expect(isD1Overloaded(undefined)).toBe(false);
    expect(isD1Overloaded({ message: 5 })).toBe(false);
  });
});
