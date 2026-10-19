"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RefreshCw, Trash2, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { clearFailures, flushPending, forUser, removePending } from "@/lib/offline-queue";
import { trpc } from "@/lib/trpc";
import { notifyPending, useOnline, usePendingEntries } from "@/lib/use-offline";

const day = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

/**
 * Sends entries that were typed offline, and tells the person what is saved and what is waiting. Mounted once in the
 * dashboard layout. It tries when the connection comes back, when the tab is shown again, and every 30 seconds while
 * something waits. Nothing shows when you are online and nothing is waiting.
 */
export function OfflineSync() {
  const utils = trpc.useUtils();
  const me = trpc.account.me.useQuery();
  const clients = trpc.clients.list.useQuery();
  const online = useOnline();
  const all = usePendingEntries();
  const userId = me.data?.id;
  const mine = userId ? forUser(all, userId) : [];
  const waiting = mine.filter((e) => !e.error).length;
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);

  const sync = useCallback(
    async (retryRefused = false) => {
      if (!userId || busy.current || !navigator.onLine) return;
      busy.current = true;
      setSyncing(true);
      try {
        if (retryRefused) {
          clearFailures(localStorage, userId);
          notifyPending();
        }
        const res = await flushPending({
          storage: localStorage,
          userId,
          send: (e) =>
            utils.client.entry.create.mutate({
              projectId: e.projectId,
              date: e.date,
              minutes: e.minutes,
              note: e.note,
              clientId: e.clientId,
            }),
        });
        notifyPending();
        if (res.sent > 0) {
          await Promise.all([utils.entry.list.invalidate(), utils.project.budgets.invalidate()]);
          toast.success(res.sent === 1 ? "1 saved entry synced." : `${res.sent} saved entries synced.`);
        }
        if (res.failed > 0) {
          toast.error(
            res.failed === 1
              ? "1 entry could not be saved. See the list at the top."
              : `${res.failed} entries could not be saved. See the list at the top.`,
          );
        }
      } finally {
        busy.current = false;
        setSyncing(false);
      }
    },
    [userId, utils],
  );

  useEffect(() => {
    if (!online || !userId || waiting === 0) return;
    void sync();
    const timer = setInterval(() => void sync(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [online, userId, waiting, sync]);

  if (online && mine.length === 0) return null;

  const labelFor = (projectId: string) => {
    for (const c of clients.data ?? []) {
      const p = c.projects.find((x) => x.id === projectId);
      if (p) return `${c.name} · ${p.name}`;
    }
    return "a project";
  };

  return (
    <section
      aria-label="Offline status"
      aria-live="polite"
      className="mx-auto mb-3 w-full max-w-5xl rounded-xl border bg-card p-3 text-sm"
    >
      <p className="flex items-center gap-2 font-medium">
        {online ? (
          <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} aria-hidden />
        ) : (
          <WifiOff className="size-4" aria-hidden />
        )}
        {!online && "You're offline"}
        {!online && mine.length > 0 && ` · ${mine.length} saved on this device`}
        {online &&
          (syncing
            ? "Syncing your saved entries…"
            : `${mine.length} saved ${mine.length === 1 ? "entry" : "entries"} to sync`)}
      </p>
      {!online && (
        <p className="mt-1 text-muted-foreground">
          Entries you add are saved on this device and sent when you're back online. Timers, edits and deletes need a
          connection.
        </p>
      )}
      {mine.length > 0 && (
        <ul className="mt-2 divide-y">
          {mine.map((e) => (
            <li key={e.clientId} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="font-medium">{labelFor(e.projectId)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {day.format(fromISODate(e.date))} · {formatDuration(e.minutes)}
                  {e.note ? ` · ${e.note.slice(0, 60)}` : ""}
                </span>
                {e.error && <span className="block text-destructive text-xs">Not saved: {e.error}</span>}
              </span>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="shrink-0"
                aria-label={`Discard the saved entry for ${day.format(fromISODate(e.date))}`}
                title="Discard this entry"
                onClick={() => {
                  removePending(localStorage, e.clientId);
                  notifyPending();
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {online && mine.length > 0 && !syncing && (
        <Button type="button" variant="outline" className="mt-2" onClick={() => void sync(true)}>
          <RefreshCw /> Try again
        </Button>
      )}
    </section>
  );
}
