"use client";

import { useState, useSyncExternalStore } from "react";

import { DeviceScene } from "@/components/device-scene";
import { Button } from "@/components/ui/button";
import { clearLocalCopy, getActiveEngine, localFirstOn, setLocalFirst, subscribeStatus } from "@/lib/local-sync/active";

function useStatus() {
  const text = useSyncExternalStore(
    subscribeStatus,
    () => {
      const e = getActiveEngine();
      if (!e) return "off";
      return `${e.ready ? "ready" : "copying"}|${e.pending}|${e.isOffline ? "offline" : "online"}|${e.lastPullAt ?? ""}`;
    },
    () => "off",
  );
  const [state, pending, link, last] = text.split("|");
  return { state, pending: Number(pending ?? 0), offline: link === "offline", last: last ? Number(last) : null };
}

/** Account > Your data: the switch for the local-first spike (issue #95) and how it is doing. */
export function LocalFirstCard() {
  const status = useStatus();
  const [on, setOn] = useState(() => localFirstOn());
  const [busy, setBusy] = useState(false);

  async function change(next: boolean) {
    setBusy(true);
    if (!next) await clearLocalCopy(); // sends what is waiting, then forgets the copy
    setLocalFirst(next);
    setOn(next);
    window.location.reload(); // the app starts (or stops) using the copy from a clean page
  }

  return (
    <section
      aria-label="This device"
      className="grid items-center gap-5 rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 sm:grid-cols-[auto_1fr] sm:gap-8 sm:p-6"
    >
      <DeviceScene className="mx-auto w-44 sm:w-56" />
      <div className="grid gap-3">
        <h3 className="font-bold font-display text-2xl leading-tight">
          Keep a copy on this device <span className="font-normal text-base text-muted-foreground">(experimental)</span>
        </h3>
        <p className="max-w-xl text-foreground/75">
          Your time entries are kept in this browser and shown from there, so the app opens and responds instantly and
          keeps working with no connection. Changes are sent to UseHourly in the background.
        </p>
        <p className="text-muted-foreground text-sm">
          {on
            ? status.state === "off"
              ? "On. Starting…"
              : status.state === "copying"
                ? "On. Making the first copy…"
                : `On. ${status.offline ? "No connection right now. " : ""}${
                    status.pending > 0
                      ? `${status.pending} change${status.pending === 1 ? " is" : "s are"} waiting to be sent.`
                      : "Everything is sent."
                  }${status.last ? ` Last checked ${new Date(status.last).toLocaleTimeString()}.` : ""}`
            : "Off. The app asks UseHourly for your entries each time."}
        </p>
        <p className="text-muted-foreground text-xs">
          Only time entries are kept this way for now. Timers, invoices, clients and projects still need a connection.
          The copy lives only in this browser and is removed when you log out.
        </p>
        <Button
          className="h-11 justify-self-start rounded-full px-5"
          variant={on ? "outline" : "primary"}
          disabled={busy}
          onClick={() => void change(!on)}
          type="button"
        >
          {on ? "Turn off" : "Turn on"}
        </Button>
      </div>
    </section>
  );
}
