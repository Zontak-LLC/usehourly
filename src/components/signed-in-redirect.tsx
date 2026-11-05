"use client";

import { useEffect } from "react";

import { DASHBOARD_PATH } from "@/lib/route-access";

/**
 * Sends a signed-in visitor from the landing page to their day. The landing page is a static file served before the
 * Worker runs, so no server sees the session cookie (it is httpOnly): the page asks `/api/auth/session` after it
 * paints. If that fails, the visitor simply stays on the landing page.
 */
export function SignedInRedirect() {
  useEffect(() => {
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((res): Promise<{ user?: unknown } | null> | null => (res.ok ? res.json() : null))
      .then((session) => {
        if (session?.user) window.location.replace(DASHBOARD_PATH);
      })
      .catch(() => undefined);
  }, []);
  return null;
}
