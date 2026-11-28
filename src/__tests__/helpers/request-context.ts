import { vi } from "vitest";

import { fakeD1 } from "./fake-d1";
import type { AsyncLocalStorage } from "node:async_hooks";

export type Req = { env: { DB: unknown }; ctx: object; cf: object; canceled: boolean };
export type RequestStore = AsyncLocalStorage<Req>;

// vitest can hand a same-tick dynamic import of a mocked module the real one, so import the mock first
export async function loadPrisma() {
  vi.resetModules();
  await import("@opennextjs/cloudflare");
  return import("@/lib/prisma");
}

// awaited inside the run: a Prisma query is lazy and only starts when someone awaits it
export const within = <T>(store: RequestStore, req: Req, fn: () => Promise<T>) =>
  store.run(req, async () => await fn());

/** A stand-in D1 holding user u1, and a Prisma client made inside a request on `store`. `run` runs a query in it. */
export async function signedIn(store: RequestStore) {
  const d1 = fakeD1();
  d1.db.exec(
    "INSERT INTO auth_users (id, name, email, password_hash, created_at) VALUES ('u1','A','a@x.invalid','x', 0)",
  );
  const { getPrisma } = await loadPrisma();
  const req: Req = { env: { DB: d1.DB }, ctx: {}, cf: {}, canceled: false };
  const prisma = await within(store, req, getPrisma);
  d1.sent.length = 0; // count only what the test sends
  const run = <T>(fn: () => Promise<T>) => within(store, req, fn);
  return { ...d1, prisma, run };
}
