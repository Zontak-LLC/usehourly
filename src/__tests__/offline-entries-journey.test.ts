import { describe, expect, it, vi } from "vitest";

import {
  addPending,
  clearFailures,
  flushPending,
  forUser,
  isNetworkError,
  MAX_PENDING,
  PENDING_KEY,
  type PendingEntry,
  readPending,
  removePending,
  type StorageLike,
} from "@/lib/offline-queue";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { withGuardedInsert } from "./helpers/guarded-insert-mock";

const createCaller = createCallerFactory(appRouter);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

/* ------------------------------------------------------------------ the server: one entry, however often it arrives */

type Row = { id: string; user_id: string; project_id: string; date: string; minutes: number; note: string };

function world() {
  const rows: Row[] = [];
  let n = 0;
  const prisma = {
    project: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; user_id: string } }) =>
        where.id === "p1" && where.user_id === "u1" ? { id: "p1", name: "Website" } : null,
      ),
    },
    timeEntry: {
      count: vi.fn(async () => rows.length),
      // like the real table: only the conditions that were asked for are applied
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; user_id?: string } }) =>
          rows.find((r) => r.id === where.id && (where.user_id === undefined || r.user_id === where.user_id)) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Partial<Row> & Omit<Row, "id"> }) => {
        const id = data.id ?? `auto-${++n}`;
        if (rows.some((r) => r.id === id)) throw new Error("Unique constraint failed on the fields: (`id`)");
        const row = { ...data, id } as Row;
        rows.push(row);
        return row;
      }),
    },
  };
  const as = (id: string | null) =>
    createCaller({
      session: id ? ({ user: { id }, expires: "" } as never) : null,
      prisma: withGuardedInsert(prisma) as never,
    });
  return { prisma, as, rows };
}

const input = { projectId: "p1", date: "2026-10-20", minutes: 90, note: "homepage", clientId: A };

describe("saving an entry twice with the same id", () => {
  it("keeps one entry and returns the saved one the second time (a retry after a dropped response)", async () => {
    const { prisma, as, rows } = world();
    const first = await as("u1").entry.create(input);
    const second = await as("u1").entry.create(input);

    expect(first.id).toBe(A);
    expect(second.id).toBe(A);
    expect(rows).toHaveLength(1);
    expect(prisma.timeEntry.create).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({
      user_id: "u1",
      project_id: "p1",
      date: "2026-10-20",
      minutes: 90,
      note: "homepage",
    });
  });

  it("hands back the winner when two sends race and the second one hits the unique id", async () => {
    const { prisma, as, rows } = world();
    // the first lookup finds nothing, the other request saves, then our create fails and the lookup finds it
    const real = prisma.timeEntry.findFirst.getMockImplementation();
    prisma.timeEntry.findFirst.mockImplementationOnce(async () => null);
    rows.push({ id: A, user_id: "u1", project_id: "p1", date: "2026-10-20", minutes: 90, note: "homepage" });
    expect(real).toBeDefined();
    const result = await as("u1").entry.create(input);
    expect(result.id).toBe(A);
    expect(rows).toHaveLength(1);
  });

  it("never gives one account another's entry when the id is already taken, and never overwrites it", async () => {
    const { as, rows } = world();
    rows.push({ id: A, user_id: "someone-else", project_id: "px", date: "2026-01-01", minutes: 5, note: "private" });
    await expect(as("u1").entry.create(input)).rejects.toThrow();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: "someone-else", note: "private", minutes: 5 });
  });

  it("works as before without an id, and refuses a malformed id or a signed-out caller, writing nothing", async () => {
    const { prisma, as, rows } = world();
    const plain = await as("u1").entry.create({ projectId: "p1", date: "2026-10-20", minutes: 30, note: "" });
    // without an id the server makes one (the guarded insert writes it, server/quota-insert.ts)
    expect(plain.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(prisma.timeEntry.create.mock.calls[0][0].data.id).not.toBe(A);

    for (const bad of ["not-a-uuid", "", "1234"]) {
      await expect(as("u1").entry.create({ ...input, clientId: bad })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(as(null).entry.create(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(rows).toHaveLength(1);
  });
});

/* ------------------------------------------------------------ the device: entries typed with no connection */

function memoryStorage(): StorageLike & { map: Map<string, string>; failWrites: boolean } {
  const map = new Map<string, string>();
  const s = {
    map,
    failWrites: false,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (s.failWrites) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
  };
  return s;
}

const entry = (clientId: string, over: Partial<PendingEntry> = {}): PendingEntry => ({
  clientId,
  userId: "u1",
  projectId: "p1",
  date: "2026-10-20",
  minutes: 60,
  note: "",
  createdAt: 1000,
  ...over,
});

describe("entries waiting on the device", () => {
  it("keeps a day typed offline across a reload, oldest first, and shows each account only its own", () => {
    const storage = memoryStorage();
    addPending(storage, entry(B, { createdAt: 2000, note: "second" }));
    addPending(storage, entry(A, { createdAt: 1000, note: "first" }));
    addPending(storage, entry(C, { userId: "u2", createdAt: 1500, note: "someone else's" }));

    // "reload": read everything back from storage alone
    const back = readPending(storage);
    expect(back).toHaveLength(3);
    expect(forUser(back, "u1").map((e) => e.note)).toEqual(["first", "second"]);
    expect(forUser(back, "u2").map((e) => e.note)).toEqual(["someone else's"]);
    expect(forUser(back, "nobody")).toEqual([]);
  });

  it("sends nothing while offline: it stops at the first failure and every entry stays in order", async () => {
    const storage = memoryStorage();
    addPending(storage, entry(A, { createdAt: 1 }));
    addPending(storage, entry(B, { createdAt: 2 }));
    const send = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const result = await flushPending({ storage, userId: "u1", send });

    expect(result).toEqual({ sent: 0, failed: 0, offline: true });
    expect(send).toHaveBeenCalledTimes(1); // it did not hammer the second one
    expect(readPending(storage).map((e) => e.clientId)).toEqual([A, B]);
  });

  it("sends oldest first with the entry's own id, removes what was saved, and keeps the rest if the connection drops again", async () => {
    const storage = memoryStorage();
    addPending(storage, entry(A, { createdAt: 1, minutes: 30, note: "a" }));
    addPending(storage, entry(B, { createdAt: 2, minutes: 45, note: "b" }));
    addPending(storage, entry(C, { createdAt: 3, minutes: 60, note: "c" }));
    const seen: PendingEntry[] = [];
    const send = vi.fn(async (e: PendingEntry) => {
      if (e.clientId === C) throw Object.assign(new Error("gateway"), { data: { httpStatus: 503 } });
      seen.push(e);
    });
    const result = await flushPending({ storage, userId: "u1", send });

    expect(seen.map((e) => [e.clientId, e.minutes, e.note])).toEqual([
      [A, 30, "a"],
      [B, 45, "b"],
    ]);
    expect(result).toEqual({ sent: 2, failed: 0, offline: true });
    expect(readPending(storage).map((e) => e.clientId)).toEqual([C]);

    // later, back online: the last one goes and the queue empties
    const done = await flushPending({ storage, userId: "u1", send: vi.fn(async () => undefined) });
    expect(done).toEqual({ sent: 1, failed: 0, offline: false });
    expect(readPending(storage)).toEqual([]);
  });

  it("marks an entry the server refuses, keeps it for the person to see, and still sends the ones behind it", async () => {
    const storage = memoryStorage();
    addPending(storage, entry(A, { createdAt: 1 }));
    addPending(storage, entry(B, { createdAt: 2 }));
    const send = vi.fn(async (e: PendingEntry) => {
      if (e.clientId === A) throw Object.assign(new Error("Project not found."), { data: { httpStatus: 404 } });
    });
    const result = await flushPending({ storage, userId: "u1", send });

    expect(result).toEqual({ sent: 1, failed: 1, offline: false });
    const left = readPending(storage);
    expect(left.map((e) => [e.clientId, e.error])).toEqual([[A, "Project not found."]]);

    // refused entries are not retried by themselves...
    const again = vi.fn(async () => undefined);
    expect(await flushPending({ storage, userId: "u1", send: again })).toEqual({ sent: 0, failed: 0, offline: false });
    expect(again).not.toHaveBeenCalled();
    // ...until the person says "try again", and only for their own account
    addPending(storage, entry(C, { userId: "u2", error: "kept" }));
    clearFailures(storage, "u1");
    expect(readPending(storage).find((e) => e.clientId === A)?.error).toBeUndefined();
    expect(readPending(storage).find((e) => e.clientId === C)?.error).toBe("kept");
  });

  it("never sends another account's entries, and lets a person discard one", async () => {
    const storage = memoryStorage();
    addPending(storage, entry(A, { userId: "u1" }));
    addPending(storage, entry(B, { userId: "u2" }));
    const send = vi.fn(async () => undefined);
    await flushPending({ storage, userId: "u2", send });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual([expect.objectContaining({ clientId: B, userId: "u2" })]);
    expect(readPending(storage).map((e) => e.clientId)).toEqual([A]);

    removePending(storage, A);
    expect(readPending(storage)).toEqual([]);
  });

  it("ignores damaged storage, drops entries that are no longer valid, and refuses when full or unwritable", () => {
    const storage = memoryStorage();
    storage.map.set(PENDING_KEY, "{not json");
    expect(readPending(storage)).toEqual([]);
    storage.map.set(PENDING_KEY, JSON.stringify({ not: "a list" }));
    expect(readPending(storage)).toEqual([]);

    storage.map.set(
      PENDING_KEY,
      JSON.stringify([
        entry(A),
        entry("not-a-uuid"),
        { ...entry(B), minutes: 0 },
        { ...entry(C), date: "10/20/2026" },
        "junk",
        null,
      ]),
    );
    expect(readPending(storage).map((e) => e.clientId)).toEqual([A]);

    // the same entry added twice is kept once
    const fresh = memoryStorage();
    expect(addPending(fresh, entry(A))).toBe(true);
    expect(addPending(fresh, entry(A))).toBe(true);
    expect(readPending(fresh)).toHaveLength(1);

    // a full queue says no, and so does storage that will not take a write
    const full = memoryStorage();
    full.map.set(
      PENDING_KEY,
      JSON.stringify(Array.from({ length: MAX_PENDING }, (_, i) => entry(crypto.randomUUID(), { createdAt: i }))),
    );
    expect(addPending(full, entry(B))).toBe(false);
    const blocked = memoryStorage();
    blocked.failWrites = true;
    expect(addPending(blocked, entry(A))).toBe(false);
  });
});

describe("telling a lost connection from a refusal", () => {
  it("treats unreachable, timed out and gateway errors as the network, and the server's own answers as refusals", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError({ message: "x", cause: new TypeError("fetch failed") })).toBe(true);
    expect(isNetworkError({ name: "TimeoutError", message: "The operation timed out" })).toBe(true);
    expect(isNetworkError({ message: "x", cause: { name: "AbortError" } })).toBe(true);
    expect(isNetworkError({ message: "Load failed", data: undefined })).toBe(true);
    for (const status of [502, 503, 504])
      expect(isNetworkError({ message: "gateway", data: { httpStatus: status } })).toBe(true);

    expect(isNetworkError({ message: "Project not found.", data: { httpStatus: 404 } })).toBe(false);
    expect(isNetworkError({ message: "Bad input", data: { httpStatus: 400 } })).toBe(false);
    expect(isNetworkError({ message: "boom", data: { httpStatus: 500 } })).toBe(false);
    expect(isNetworkError({ message: "something else entirely" })).toBe(false);
    expect(isNetworkError("a string")).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});
