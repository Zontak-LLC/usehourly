import { describe, expect, it } from "vitest";

import { authenticateMcp } from "@/server/mcp/auth";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

const createCaller = createCallerFactory(appRouter);

type Row = {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  prefix: string;
  access: string;
  token_version: number;
  expires_at: number | null;
  last_used_at: number | null;
  revoked_at: number | null;
  oauth_client_id: string | null;
  created_at: Date;
};

/** An in-memory api_tokens table with just the calls the token procedures and the MCP check make. */
function fakeDb() {
  const rows: Row[] = [];
  const users = new Map([
    ["u1", { id: "u1", token_version: 0, is_demo: false }],
    ["u2", { id: "u2", token_version: 0, is_demo: false }],
  ]);
  const matches = (r: Row, w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => r[k as keyof Row] === v);
  let n = 0;
  const prisma = {
    ...memoryRateLimit(),
    authUser: { findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null },
    apiToken: {
      count: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).length,
      create: async ({ data }: { data: Partial<Row> }) => {
        const row = {
          id: `t${++n}`,
          expires_at: null,
          last_used_at: null,
          revoked_at: null,
          oauth_client_id: null,
          token_version: 0,
          created_at: new Date(),
          ...data,
        } as Row;
        rows.push(row);
        return row;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)),
      findUnique: async ({ where }: { where: { token_hash: string } }) => {
        const r = rows.find((x) => x.token_hash === where.token_hash);
        return r ? { ...r, user: users.get(r.user_id) } : null;
      },
      update: async () => ({}),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const hit = rows.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) rows.splice(i, 1);
        return { count: before - rows.length };
      },
    },
  };
  const as = (uid: string | null) =>
    createCaller({ session: uid ? { user: { id: uid }, expires: "" } : null, prisma: prisma as never });
  return { prisma, rows, as };
}

describe("deleting an API token", () => {
  it("stops an active token at once and takes it off the list", async () => {
    const { prisma, rows, as } = fakeDb();
    const made = await as("u1").account.createApiToken({ name: "Cursor", access: "write", expires: "never" });
    const header = `Bearer ${made.token}`;
    expect((await authenticateMcp(prisma as never, header, null)).ok).toBe(true);

    await as("u1").account.deleteApiToken({ id: made.id });

    expect(rows).toHaveLength(0);
    expect(await as("u1").account.listApiTokens()).toEqual([]);
    const after = await authenticateMcp(prisma as never, header, null);
    expect(after).toMatchObject({ ok: false, status: 401 });
  });

  it("removes a revoked token from the list too", async () => {
    const { rows, as } = fakeDb();
    const made = await as("u1").account.createApiToken({ name: "Old laptop", access: "read", expires: "never" });
    await as("u1").account.revokeApiToken({ id: made.id });
    expect((await as("u1").account.listApiTokens()).map((t) => t.state)).toEqual(["revoked"]);
    await as("u1").account.deleteApiToken({ id: made.id });
    expect(rows).toHaveLength(0);
  });

  it("never touches another account's token, and says not found", async () => {
    const { rows, as } = fakeDb();
    const theirs = await as("u2").account.createApiToken({ name: "Theirs", access: "write", expires: "never" });
    await expect(as("u1").account.deleteApiToken({ id: theirs.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(rows.map((r) => r.id)).toEqual([theirs.id]);
    await expect(as("u1").account.deleteApiToken({ id: "no-such-token" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("needs a signed-in user and a real id, and touches nothing otherwise", async () => {
    const { rows, as } = fakeDb();
    const mine = await as("u1").account.createApiToken({ name: "Mine", access: "read", expires: "never" });
    await expect(as(null).account.deleteApiToken({ id: mine.id })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(as("u1").account.deleteApiToken({ id: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(as("u1").account.deleteApiToken({ id: "x".repeat(65) })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(rows).toHaveLength(1);
  });
});
