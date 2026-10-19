"use client";

import { useEffect } from "react";

const KEY = "hourly:guideKept";

/**
 * Keeps the whole guide on the device once, a few seconds after the app opens, so it reads with no connection (the
 * service worker stores each page it is asked for with the "x-keep" header). It runs again only when the guide's text
 * changes. Does nothing without a service worker (development, a private window) or without a connection.
 */
export function GuideKeeper({ paths, version }: { paths: string[]; version: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        if (localStorage.getItem(KEY) === version) return;
        await navigator.serviceWorker.ready;
        // A worker that does not control this page yet cannot keep anything: try again on the next visit.
        if (!navigator.serviceWorker.controller || !navigator.onLine) return;
        for (const path of paths) {
          if (cancelled) return;
          const res = await fetch(path, { headers: { "x-keep": "1" }, credentials: "same-origin" });
          if (!res.ok) return;
        }
        localStorage.setItem(KEY, version);
      } catch {
        // offline or storage blocked: the next visit tries again
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [paths, version]);
  return null;
}
