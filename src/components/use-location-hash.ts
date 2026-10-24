"use client";

import { useSyncExternalStore } from "react";

/** Sent after the address's #part changed without a `hashchange` (history.pushState, or Next's router.push). */
const HASH_EVENT = "hourly:hash";

function subscribe(onChange: () => void) {
  for (const name of ["hashchange", "popstate", HASH_EVENT]) window.addEventListener(name, onChange);
  return () => {
    for (const name of ["hashchange", "popstate", HASH_EVENT]) window.removeEventListener(name, onChange);
  };
}

/** The address's #part without the "#" ("" on the server and when there is none). */
export function useLocationHash(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash.replace(/^#/, ""),
    () => "",
  );
}

/** Go to another #part of this page (a new history entry, so Back returns), or to none. */
export function pushLocationHash(hash: string | null) {
  const { pathname, search } = window.location;
  window.history.pushState(null, "", hash ? `#${hash}` : `${pathname}${search}`);
  window.dispatchEvent(new Event(HASH_EVENT));
}
