import { describe, expect, it, vi } from "vitest";

import { fakeD1 as fakeD1Over } from "./helpers/fake-d1";
import { settles } from "./helpers/settles";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Issue 315: under load on staging about one request in 3,000 ended as a 500, "Worker's code had hung". The cause:
 * one PrismaClient was shared by every request in the isolate, and its DataLoader merges the findUnique calls of
 * ALL callers in the same tick into one query, sent from the request that got there first. When that request was
 * canceled (the person clicked on before the page had loaded), its I/O never finished and the other request,
 * waiting on the same query, could never wake up.
 *
 * This runs the REAL Prisma client and D1 adapter over a stand-in D1 that behaves like workerd: each request is
 * its own context (OpenNext's `{ env, ctx, cf }` in an AsyncLocalStorage), and a query sent from a canceled request
 * never settles.
 */

type Req = { env: { DB: unknown }; ctx: object; cf: object; canceled: boolean };
const requests = vi.hoisted(() => ({ als: null as unknown as AsyncLocalStorage<Req> }));
requests.als = new AsyncLocalStorage<Req>();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => {
    const store = requests.als.getStore();
    if (!store) throw new Error("not inside a request");
    return store;
  },
}));

// workerd ties I/O to the request that started it: if that request is gone, the answer never arrives
const fakeD1 = () => fakeD1Over(() => requests.als.getStore());

// vitest can hand a same-tick dynamic import of a mocked module the real one, so import the mock first
async function loadPrisma() {
  vi.resetModules();
  await import("@opennextjs/cloudflare");
  return import("@/lib/prisma");
}

const request = (DB: unknown): Req => ({ env: { DB }, ctx: {}, cf: {}, canceled: false });
// awaited inside the run: a Prisma query is lazy and only starts when someone awaits it
const within = <T>(req: Req, fn: () => Promise<T>) => requests.als.run(req, async () => await fn());

describe("the database client under concurrent requests (issue 315)", () => {
  it("a request whose neighbour is canceled still gets its answer", async () => {
    const { db, DB, sent } = fakeD1();
    db.exec(
      "INSERT INTO auth_users (id, name, email, password_hash, created_at) VALUES ('u1','A','a@x.invalid','x', 0), ('u2','B','b@x.invalid','x', 0)",
    );
    const { getPrisma } = await loadPrisma();
    const a = request(DB);
    const b = request(DB);
    // both requests ask for their account in the same tick, exactly as createContext does for every tRPC call
    // (one at a time: vitest can hand a same-tick dynamic import of a mocked module the real one)
    const pa = await within(a, getPrisma);
    const pb = await within(b, getPrisma);
    const first = within(a, () => pa.authUser.findUnique({ where: { id: "u1" }, select: { email: true } }));
    const second = within(b, () => pb.authUser.findUnique({ where: { id: "u2" }, select: { email: true } }));
    a.canceled = true; // the person in request A clicked on; workerd drops A's I/O
    first.catch(() => undefined);

    expect(await settles(second)).toBe("settled");
    expect(await second).toEqual({ email: "b@x.invalid" });
    // B's question went out from B itself, never folded into A's query
    expect(sent.filter((s) => s.by === b && s.sql.includes("auth_users")).length).toBe(1);
    expect(sent.every((s) => !s.sql.includes("IN (?,?)"))).toBe(true);
  });

  it("calls inside one request share one client; another request gets its own", async () => {
    const { DB } = fakeD1();
    const { getPrisma } = await loadPrisma();
    const a = request(DB);
    const b = request(DB);
    // the second call comes while the first client is still being built: it must wait for that one, not build another
    const [a1, a2] = await within(a, async () => {
      const first = getPrisma();
      await new Promise((r) => setTimeout(r, 0));
      return Promise.all([first, getPrisma()]);
    });
    const a3 = await within(a, getPrisma);
    const b1 = await within(b, getPrisma);
    expect(a1).toBe(a2);
    expect(a1).toBe(a3);
    expect(b1).not.toBe(a1);
  });
});
