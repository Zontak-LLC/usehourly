import { type DehydratedState, dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";

/**
 * A copy of the last data the app showed, kept in this browser so the app has something to show with no connection.
 * Only a short list of everyday queries is kept (entries, clients, totals and budgets), the newest few, and only up to
 * a size cap. The copy belongs to one account: it is cleared on sign-out and whenever a different account signs in on
 * this browser, and an unrelated person never sees it. (Entries typed offline live in offline-queue.ts, separately.)
 */
export const QUERY_CACHE_KEY = "hourly:queryCache";
export const OWNER_KEY = "hourly:cacheOwner";
const VERSION = 1;

/**
 * Only these queries are kept: the lists and totals each page opens with, so a returning visit (or a visit with no
 * connection) shows its last data at once while fresh data loads. Anything big or private (logos, the account, one
 * invoice's full copy, a running timer) is not.
 */
export const PERSISTED_QUERIES = [
  "entry.list",
  "entry.nonBillableDays",
  "clients.list",
  "project.totals",
  "project.budgets",
  "invoice.list",
  "report.annual",
] as const;

export const MAX_QUERIES = 40;
export const MAX_BYTES = 1_500_000;
/** A copy older than this is not shown: it would mislead more than help. */
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** "entry.list" for tRPC's query key [["entry", "list"], {...}]. */
export function queryPath(queryKey: readonly unknown[]): string {
  const first = queryKey[0];
  return Array.isArray(first) ? first.join(".") : "";
}

export function persistable(queryKey: readonly unknown[]): boolean {
  return (PERSISTED_QUERIES as readonly string[]).includes(queryPath(queryKey));
}

type Saved = { v: number; savedAt: number; state: DehydratedState };

/** The newest queries that fit: at most MAX_QUERIES, and dropping the oldest until the text is under MAX_BYTES. */
export function prune(state: DehydratedState): DehydratedState {
  const queries = [...state.queries]
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
    .slice(0, MAX_QUERIES);
  const size = (qs: typeof queries) => JSON.stringify({ queries: qs }).length;
  while (queries.length > 0 && size(queries) > MAX_BYTES) queries.pop();
  return { mutations: [], queries };
}

let saving = true;

/**
 * Called when sign-out starts: nothing is saved again on this page. The app saves its copy when a page is hidden or
 * left, which is also what happens as sign-out navigates away, and that last save would put back what was just cleared.
 */
export function stopSaving(): void {
  saving = false;
}

/** Saves the everyday queries. Never throws: a full or blocked storage just means no offline copy. */
export function saveQueries(client: QueryClient, storage: StorageLike, now = Date.now()): void {
  if (!saving) return;
  try {
    const state = prune(
      dehydrate(client, { shouldDehydrateQuery: (q) => q.state.status === "success" && persistable(q.queryKey) }),
    );
    const saved: Saved = { v: VERSION, savedAt: now, state };
    storage.setItem(QUERY_CACHE_KEY, JSON.stringify(saved));
  } catch {
    // quota exceeded or storage blocked: carry on without a copy
  }
}

/** Fills the app with the saved copy. Returns how many queries were restored (0 when there is nothing usable). */
export function restoreQueries(client: QueryClient, storage: StorageLike, now = Date.now()): number {
  try {
    const raw = storage.getItem(QUERY_CACHE_KEY);
    if (!raw) return 0;
    const saved = JSON.parse(raw) as Saved;
    if (saved.v !== VERSION || typeof saved.savedAt !== "number" || now - saved.savedAt > MAX_AGE_MS) return 0;
    const queries = (saved.state?.queries ?? []).filter((q) => persistable(q.queryKey));
    hydrate(client, { mutations: [], queries });
    // The copy is a placeholder to show at once (and to keep showing with no connection), never the truth: mark it stale
    // so every page that mounts, now or after the layout, loads fresh data when it can (a query fetched a few seconds
    // before the reload would otherwise count as fresh and hide changes made elsewhere, like a teammate's entry).
    void client.invalidateQueries();
    return queries.length;
  } catch {
    return 0;
  }
}

/** Whether the saved copy belongs to the signed-in account: restore it if so, otherwise forget it (a different person). */
export function ownerAction(storedOwner: string | null, userId: string): "restore" | "reset" {
  return storedOwner === userId ? "restore" : "reset";
}

/** Forgets the saved copy and the kept pages. Called on sign-out and when a different account signs in. */
export async function clearOfflineData(storage: StorageLike | null = safeStorage()): Promise<void> {
  try {
    storage?.removeItem(QUERY_CACHE_KEY);
    storage?.removeItem(OWNER_KEY);
  } catch {
    // storage blocked
  }
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.controller?.postMessage("clear");
    }
    if (typeof caches !== "undefined") {
      for (const name of await caches.keys()) if (name.startsWith("hourly-pages")) await caches.delete(name);
    }
  } catch {
    // no cache storage here
  }
}

/** This browser's localStorage, or null where it is missing or blocked (private windows, tests). */
export function safeStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
