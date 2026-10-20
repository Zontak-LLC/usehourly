"use client";

import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { toast } from "sonner";

import { localFirstOn, notifyStatus, setActiveEngine } from "@/lib/local-sync/active";
import { SyncEngine } from "@/lib/local-sync/engine";
import { idbStore, localStoreAvailable } from "@/lib/local-sync/idb-store.client";
import type { EntryRow, PullResult, Remote } from "@/lib/local-sync/types";
import { toastError } from "@/lib/toast-error";
import { MAX_BATCH } from "@/lib/trpc-limits";
import type { AppRouter } from "@/server/routers/_app";

const SYNC_EVERY_MS = 30_000;

/**
 * Local-first spike (issue #95): when the switch is on, opens the device database for this account and keeps it in
 * step with the server in the background. Renders nothing. See lib/local-sync/engine.ts.
 */
export function LocalFirst({ userId, isDemo }: { userId: string; isDemo: boolean }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!localFirstOn() || isDemo) return;
    let stopped = false;
    let reloading = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      if (!(await localStoreAvailable()) || stopped) return;
      // A plain client of its own, so the engine's calls are never answered by the engine.
      const api = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/api/trpc", maxItems: MAX_BATCH })] });
      // tRPC types timestamps as Date but delivers them as text (no transformer), which is what the copy stores.
      const remote: Remote = {
        // check-rules-ok: timestamps arrive as text, typed as Date
        pull: async (input) => (await api.sync.pull.query(input)) as unknown as PullResult,
        // check-rules-ok: timestamps arrive as text, typed as Date
        create: async (input) => (await api.entry.create.mutate(input)) as unknown as EntryRow,
        // check-rules-ok: timestamps arrive as text, typed as Date
        update: async (input) => (await api.entry.update.mutate(input)) as unknown as EntryRow,
        delete: (input) => api.entry.delete.mutate(input),
      };

      const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("hourly-local-sync");
      const e = new SyncEngine({
        userId,
        store: idbStore(),
        remote,
        onChange: () => {
          // What the screens read may have changed: ask them to read again (answered from the device, no network).
          void queryClient.invalidateQueries({ queryKey: [["entry"]] });
          void queryClient.invalidateQueries({ queryKey: [["project"]] });
          notifyStatus();
          document.documentElement.dataset.localFirst = e.ready ? "ready" : "copying"; // for tests and debugging
          if (!reloading) channel?.postMessage("changed");
        },
        onRefused: (message) => toast.error(message),
      });
      try {
        await e.start();
      } catch (err) {
        toastError(err, "Could not open the copy kept on this device.");
        return;
      }
      if (stopped) return;
      setActiveEngine(e);
      // Reads of entries are answered on the device, so they must run (and refresh after a change) even when the
      // browser says it is offline; by default react-query would hold them until the connection returns.
      for (const path of ["list", "nonBillableDays"]) {
        queryClient.setQueryDefaults([["entry", path]], { networkMode: "always" });
      }
      document.documentElement.dataset.localFirst = e.ready ? "ready" : "copying";
      const sync = () => void e.sync();
      sync();

      const timer = setInterval(sync, SYNC_EVERY_MS);
      const onVisible = () => document.visibilityState === "visible" && sync();
      window.addEventListener("online", sync);
      document.addEventListener("visibilitychange", onVisible);
      if (channel) {
        channel.onmessage = () => {
          reloading = true;
          void e.reload().finally(() => {
            reloading = false;
          });
        };
      }
      cleanups.push(
        () => clearInterval(timer),
        () => window.removeEventListener("online", sync),
        () => document.removeEventListener("visibilitychange", onVisible),
        () => channel?.close(),
      );
    })();

    return () => {
      stopped = true;
      for (const c of cleanups) c();
      setActiveEngine(null);
      for (const path of ["list", "nonBillableDays"]) {
        queryClient.setQueryDefaults([["entry", path]], { networkMode: "online" });
      }
      delete document.documentElement.dataset.localFirst;
    };
  }, [userId, isDemo, queryClient]);

  return null;
}
