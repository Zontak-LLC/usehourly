"use client";

import { useSyncExternalStore } from "react";

import { PENDING_KEY, type PendingEntry, readPending } from "@/lib/offline-queue";

const listeners = new Set<() => void>();

/** Call after changing the queue so every component showing it updates (other tabs hear about it from the storage event). */
export function notifyPending(): void {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

const EMPTY: PendingEntry[] = [];
let cache: { raw: string | null; list: PendingEntry[] } = { raw: null, list: EMPTY };

/** The same array until the stored text changes, which is what useSyncExternalStore needs. */
function getSnapshot(): PendingEntry[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(PENDING_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cache.raw) return cache.list;
  cache = { raw, list: raw === null ? EMPTY : readPending(localStorage) };
  return cache.list;
}

/** Everything waiting on this device (all accounts); filter with forUser. */
export function usePendingEntries(): PendingEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

function subscribeOnline(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Whether the browser thinks it has a connection. (It can say yes with no real internet; sending still handles that.) */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
