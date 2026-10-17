"use client";

import { useEffect, useRef } from "react";

import { usePathname } from "next/navigation";

import { usagePageForPath } from "@/lib/usage";

/**
 * Tells the server which in-app page was opened, so the owner can see which parts are used. It sends only
 * the page name (see /api/usage); failures are ignored because counting must never get in anyone's way.
 */
export function UsageBeacon() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    const page = usagePageForPath(pathname);
    if (!page || last.current === page) return;
    last.current = page;
    try {
      const body = JSON.stringify({ page });
      if (!navigator.sendBeacon?.("/api/usage", new Blob([body], { type: "application/json" }))) {
        void fetch("/api/usage", { method: "POST", body, keepalive: true }).catch(() => undefined);
      }
    } catch {
      // Counting is optional.
    }
  }, [pathname]);

  return null;
}
