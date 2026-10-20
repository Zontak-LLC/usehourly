import type { EntryRow, Meta, Op, SyncStore } from "./types";

/** The device database for local-first sync. One per browser; `Meta.userId` says whose copy it holds. */
export const LOCAL_DB = "hourly-local";
const ENTRIES = "entries";
const OPS = "ops";
const META = "meta";
const META_KEY = "meta";

const wrap = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOCAL_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore(ENTRIES, { keyPath: "id" });
      db.createObjectStore(OPS, { keyPath: "seq" });
      db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** True when this browser can keep the copy (IndexedDB exists and opens; it may not in a private window). */
export async function localStoreAvailable(): Promise<boolean> {
  try {
    if (typeof indexedDB === "undefined") return false;
    (await open()).close();
    return true;
  } catch {
    return false;
  }
}

export function idbStore(): SyncStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= open());

  return {
    async load() {
      const d = await db();
      const tx = d.transaction([ENTRIES, OPS, META], "readonly");
      const [entries, ops, meta] = await Promise.all([
        wrap(tx.objectStore(ENTRIES).getAll() as IDBRequest<EntryRow[]>),
        wrap(tx.objectStore(OPS).getAll() as IDBRequest<Op[]>),
        wrap(tx.objectStore(META).get(META_KEY) as IDBRequest<Meta | undefined>),
      ]);
      return { entries, ops: ops.sort((a, b) => a.seq - b.seq), meta: meta ?? null };
    },

    async save(change) {
      const d = await db();
      const tx = d.transaction([ENTRIES, OPS, META], "readwrite");
      const entries = tx.objectStore(ENTRIES);
      if (change.replaceEntries) {
        entries.clear();
        for (const e of change.replaceEntries) entries.put(e);
      }
      for (const e of change.putEntries ?? []) entries.put(e);
      for (const id of change.deleteEntries ?? []) entries.delete(id);
      if (change.ops) {
        const ops = tx.objectStore(OPS);
        ops.clear();
        for (const op of change.ops) ops.put(op);
      }
      if (change.meta) tx.objectStore(META).put(change.meta, META_KEY);
      await done(tx);
    },

    async clear(keepOps) {
      const d = await db();
      const tx = d.transaction([ENTRIES, OPS, META], "readwrite");
      tx.objectStore(ENTRIES).clear();
      tx.objectStore(META).clear();
      if (!keepOps) tx.objectStore(OPS).clear();
      await done(tx);
    },
  };
}
