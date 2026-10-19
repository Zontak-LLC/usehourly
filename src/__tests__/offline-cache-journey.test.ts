import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  clearOfflineData,
  MAX_AGE_MS,
  MAX_BYTES,
  MAX_QUERIES,
  OWNER_KEY,
  ownerAction,
  persistable,
  QUERY_CACHE_KEY,
  queryPath,
  restoreQueries,
  type StorageLike,
  saveQueries,
  stopSaving,
} from "@/lib/offline-cache";
import { accessDecision } from "@/lib/route-access";

const key = (path: string, input: unknown = {}) => [path.split("."), { input, type: "query" }] as const;

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
    removeItem: (k: string) => void map.delete(k),
  };
  return s;
}

describe("the copy of your last data kept for offline", () => {
  it("keeps only everyday queries, so nothing large or private is written to the device", () => {
    expect(queryPath(key("entry.list"))).toBe("entry.list");
    expect(queryPath(["not", "a", "trpc", "key"])).toBe("");
    for (const ok of ["entry.list", "entry.nonBillableDays", "clients.list", "project.totals", "project.budgets"]) {
      expect(persistable(key(ok))).toBe(true);
    }
    for (const no of [
      "account.me",
      "project.logos",
      "entry.running",
      "invoice.get",
      "clients.get",
      "account.apiTokens",
    ]) {
      expect(persistable(key(no))).toBe(false);
    }

    const client = new QueryClient();
    client.setQueryData(key("entry.list", { from: "2026-10-19", to: "2026-10-25" }), [{ id: "e1", note: "keep me" }]);
    client.setQueryData(key("account.me"), { id: "u1", email: "me@example.com", logo: "data:image/png;base64,AAAA" });
    client.setQueryData(key("invoice.get", { id: "i1" }), { snapshot: "private invoice" });
    const storage = memoryStorage();
    saveQueries(client, storage);

    const text = storage.getItem(QUERY_CACHE_KEY) ?? "";
    expect(text).toContain("keep me");
    expect(text).not.toContain("me@example.com");
    expect(text).not.toContain("private invoice");
    expect(text).not.toContain("data:image");
  });

  it("a restored copy is only a placeholder: a page that opens after it still loads fresh data, even if the copy is seconds old", async () => {
    const week = key("entry.list", { from: "2026-10-19", to: "2026-10-25" });
    const from = new QueryClient();
    from.setQueryData(week, [{ id: "e1", note: "saved copy" }]); // fetched a moment ago: inside the 15 s freshness window
    const storage = memoryStorage();
    saveQueries(from, storage);

    // The app's client: data counts as fresh for 15 seconds, and the page (inside a Suspense boundary) mounts after the
    // layout has already restored the copy.
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000 } } });
    expect(restoreQueries(client, storage)).toBe(1);
    const fetchFresh = vi.fn(async () => [
      { id: "e1", note: "saved copy" },
      { id: "e2", note: "logged by a teammate" },
    ]);
    const page = new QueryObserver(client, { queryKey: week, queryFn: fetchFresh });
    const stop = page.subscribe(() => undefined);
    expect(page.getCurrentResult().data).toEqual([{ id: "e1", note: "saved copy" }]); // shown at once, nothing blank
    await vi.waitFor(() => expect(page.getCurrentResult().data).toHaveLength(2));
    expect(fetchFresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it("puts the copy back so a reopened app shows what it last showed, with no connection needed", () => {
    const from = new QueryClient();
    const week = key("entry.list", { from: "2026-10-19", to: "2026-10-25" });
    from.setQueryData(week, [{ id: "e1", minutes: 90, note: "logged yesterday" }]);
    from.setQueryData(key("clients.list"), [{ id: "c1", name: "Acme", projects: [] }]);
    const storage = memoryStorage();
    saveQueries(from, storage);

    const reopened = new QueryClient();
    expect(restoreQueries(reopened, storage)).toBe(2);
    expect(reopened.getQueryData(week)).toEqual([{ id: "e1", minutes: 90, note: "logged yesterday" }]);
    expect(reopened.getQueryData(key("clients.list"))).toEqual([{ id: "c1", name: "Acme", projects: [] }]);
  });

  it("keeps the newest queries, and drops the oldest when the copy would be too big", () => {
    const client = new QueryClient();
    for (let i = 0; i < MAX_QUERIES + 6; i++) {
      client.setQueryData(key("entry.list", { n: i }), [{ id: `e${i}` }], { updatedAt: 1000 + i });
    }
    const storage = memoryStorage();
    saveQueries(client, storage);
    const kept = JSON.parse(storage.getItem(QUERY_CACHE_KEY) ?? "{}").state.queries as {
      state: { dataUpdatedAt: number };
    }[];
    expect(kept).toHaveLength(MAX_QUERIES);
    expect(Math.min(...kept.map((q) => q.state.dataUpdatedAt))).toBe(1000 + 6); // the six oldest are gone

    const big = new QueryClient();
    const chunk = "x".repeat(400_000);
    big.setQueryData(key("entry.list", { n: 1 }), [chunk], { updatedAt: 1 });
    big.setQueryData(key("entry.list", { n: 2 }), [chunk], { updatedAt: 2 });
    big.setQueryData(key("entry.list", { n: 3 }), [chunk], { updatedAt: 3 });
    const small = memoryStorage();
    saveQueries(big, small);
    const bigKept = JSON.parse(small.getItem(QUERY_CACHE_KEY) ?? "{}").state.queries as {
      state: { dataUpdatedAt: number };
    }[];
    expect(bigKept.map((q) => q.state.dataUpdatedAt)).toEqual([3, 2]); // the oldest went first
    expect(JSON.stringify({ queries: bigKept }).length).toBeLessThanOrEqual(MAX_BYTES);
  });

  it("ignores a copy that is too old, from another version, damaged or missing, and never throws", () => {
    const client = new QueryClient();
    client.setQueryData(key("entry.list"), [{ id: "e1" }]);
    const storage = memoryStorage();
    saveQueries(client, storage, 1_000_000);

    expect(restoreQueries(new QueryClient(), storage, 1_000_000 + MAX_AGE_MS + 1)).toBe(0); // too old
    expect(restoreQueries(new QueryClient(), storage, 1_000_000 + MAX_AGE_MS - 1)).toBe(1);

    const parsed = JSON.parse(storage.getItem(QUERY_CACHE_KEY) ?? "{}");
    storage.map.set(QUERY_CACHE_KEY, JSON.stringify({ ...parsed, v: 99 }));
    expect(restoreQueries(new QueryClient(), storage, 1_000_000)).toBe(0);
    storage.map.set(QUERY_CACHE_KEY, "{not json");
    expect(restoreQueries(new QueryClient(), storage)).toBe(0);
    storage.map.delete(QUERY_CACHE_KEY);
    expect(restoreQueries(new QueryClient(), storage)).toBe(0);

    // a query that is not on the list is dropped even if someone put it in the stored text
    storage.map.set(
      QUERY_CACHE_KEY,
      JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        state: {
          mutations: [],
          queries: [
            {
              queryKey: key("account.me"),
              queryHash: "h",
              state: { data: { id: "x" }, dataUpdatedAt: 1, status: "success" },
            },
          ],
        },
      }),
    );
    const guarded = new QueryClient();
    expect(restoreQueries(guarded, storage)).toBe(0);
    expect(guarded.getQueryData(key("account.me"))).toBeUndefined();

    // storage that will not take a write does not break saving
    const blocked = memoryStorage();
    blocked.failWrites = true;
    expect(() => saveQueries(client, blocked)).not.toThrow();
  });

  it("restores the copy only for the account it belongs to, and forgets it for anyone else", async () => {
    expect(ownerAction("u1", "u1")).toBe("restore");
    expect(ownerAction("u1", "u2")).toBe("reset");
    expect(ownerAction(null, "u1")).toBe("reset"); // a first run starts clean

    const storage = memoryStorage();
    storage.map.set(QUERY_CACHE_KEY, "copy");
    storage.map.set(OWNER_KEY, "u1");
    await clearOfflineData(storage);
    expect(storage.map.size).toBe(0);
  });
});

describe("the offline worker files", () => {
  it("can be fetched by anyone, signed in or not, because the browser asks for them before sign-in", () => {
    for (const path of ["/sw.js", "/offline.html"]) {
      expect(accessDecision(path, false)).toBe("allow");
      expect(accessDecision(path, true)).toBe("allow");
    }
    // look-alikes are still behind sign-in
    expect(accessDecision("/sw.js.map", false)).toBe("to-login");
    expect(accessDecision("/dashboard/sw.js", false)).toBe("to-login");
  });
});

describe("signing out", () => {
  it("cannot be undone by the save the app does as the page is left", () => {
    const client = new QueryClient();
    client.setQueryData(key("entry.list"), [{ id: "e1", note: "private" }]);
    const storage = memoryStorage();

    saveQueries(client, storage); // normal use: the copy is kept
    expect(storage.map.has(QUERY_CACHE_KEY)).toBe(true);

    storage.map.delete(QUERY_CACHE_KEY); // sign-out clears it...
    stopSaving();
    saveQueries(client, storage); // ...and the save that fires as the page unloads must not put it back
    expect(storage.map.has(QUERY_CACHE_KEY)).toBe(false);
  });
});
