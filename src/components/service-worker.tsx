"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker (public/sw.js). Only in the real app, or when a test asks for it with
 * NEXT_PUBLIC_ENABLE_SW=1: in development its kept files would hide edits.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_SW !== "1") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // no worker (a private window, an old browser): the app simply needs a connection
    });
  }, []);
  return null;
}
