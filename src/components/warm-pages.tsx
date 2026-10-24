"use client";

import { useEffect } from "react";

import { toISODate } from "@/lib/dates";
import { trpc } from "@/lib/trpc";
import { warmRanges } from "@/lib/warm-pages";

/**
 * Pre-caches the busy tab pages' data once the page in front of you has settled, so switching to Week, Month,
 * Invoices or Clients shows its data at once instead of waiting for the server (a second or more after a cold
 * start). It asks for the SAME queries with the SAME inputs as those pages, so they find the answers in the cache.
 * It waits 3 seconds and an idle moment (the page's own request goes first and alone), skips connections that ask
 * to save data, and fetches nothing that is still fresh.
 */
export function WarmPages() {
  const utils = trpc.useUtils();
  useEffect(() => {
    const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData || !navigator.onLine) return;
    let idle: number | undefined;
    const timer = window.setTimeout(() => {
      const run = () => {
        const { week, month } = warmRanges(toISODate(new Date()));
        for (const range of [week, month]) {
          void utils.entry.list.prefetch(range);
          void utils.entry.nonBillableDays.prefetch(range);
        }
        void utils.invoice.list.prefetch(); // no input, as on Invoices and Clients
        void utils.clients.list.prefetch();
      };
      idle = "requestIdleCallback" in window ? window.requestIdleCallback(run, { timeout: 2000 }) : undefined;
      if (idle === undefined) run();
    }, 3000);
    return () => {
      window.clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
    };
  }, [utils]);
  return null;
}
