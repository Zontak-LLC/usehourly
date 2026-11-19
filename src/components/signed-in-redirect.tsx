"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { DASHBOARD_PATH } from "@/lib/route-access";

/**
 * Sends a signed-in visitor from the landing page to their day. The landing page is a static file served before the
 * Worker runs, so no server sees the session cookie (it is httpOnly): the page asks `/api/auth/session` after it
 * paints. If that fails, the visitor stays on the landing page and the reason goes to the console.
 */
export function SignedInRedirect() {
  const router = useRouter();
  useEffect(() => {
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((res): Promise<{ user?: unknown } | null> => {
        if (!res.ok) throw new Error(`the session check answered ${res.status}`);
        return res.json();
      })
      .then((session) => {
        if (session?.user) router.replace(DASHBOARD_PATH);
      })
      .catch((err: unknown) => {
        // A warning, not an error: the page still works, the visitor only signs in again from it.
        // biome-ignore lint/suspicious/noConsole: the one place this failure is told, there is no screen for it
        console.warn("Landing page: could not check the session, staying here:", err);
      });
  }, [router]);
  return null;
}
