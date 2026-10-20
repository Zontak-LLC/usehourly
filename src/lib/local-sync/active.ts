import type { SyncEngine } from "./engine";
import { idbStore } from "./idb-store.client";

/** The per-browser switch for the local-first spike. Off unless the person turned it on (Account > Your data). */
export const LOCAL_FIRST_KEY = "hourly:localFirst";

export function localFirstOn(): boolean {
  try {
    return localStorage.getItem(LOCAL_FIRST_KEY) === "1";
  } catch {
    return false;
  }
}
export function setLocalFirst(on: boolean): void {
  try {
    if (on) localStorage.setItem(LOCAL_FIRST_KEY, "1");
    else localStorage.removeItem(LOCAL_FIRST_KEY);
  } catch {
    // storage blocked: the switch cannot be kept
  }
}

let active: SyncEngine | null = null;
/** The engine the tRPC link consults. Set by `LocalFirst` once the device database is open. */
export const getActiveEngine = () => active;
export function setActiveEngine(engine: SyncEngine | null): void {
  active = engine;
  for (const l of listeners) l();
}

const listeners = new Set<() => void>();
export function subscribeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function notifyStatus(): void {
  for (const l of listeners) l();
}

/**
 * Called when the person signs out or turns the switch off: sends what is waiting if it can (a few seconds at most),
 * then forgets the copy. Changes that could not be sent stay (they belong to the account and go out when it is next
 * signed in), unless `forgetEverything`, as when the account is deleted.
 */
export async function clearLocalCopy(forgetEverything = false): Promise<void> {
  const engine = active;
  active = null;
  try {
    if (engine && !forgetEverything) await Promise.race([engine.sync(), new Promise((r) => setTimeout(r, 3_000))]);
    const keep = !forgetEverything && (engine?.pending ?? 0) > 0;
    if (typeof indexedDB !== "undefined") await idbStore().clear(keep);
  } catch {
    // nothing to clear, or the browser refused
  }
}
