"use client";

import { useEffect, useRef, useState } from "react";

import { CircleCheck, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { formatDuration } from "@/lib/duration";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** After Stop the bar asks "keep or discard?" this long, then keeps the time and quietly goes away. */
const DECIDE_MS = 20_000;
/** A press on Start or Stop locks both for this long, so a double click cannot start and then stop (found 2026-10-23). */
export const TIMER_LOCK_MS = 1000;
/** Sent when a timer is stopped from anywhere (the bar or the add form's Start/Stop button). */
export const STOPPED_EVENT = "hourly:timer-stopped";

export type Stopped = { id: string; minutes: number; where: string; projectId?: string; note?: string };

export function timerParts(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return { h, m, s, text: `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` };
}

/**
 * Stopping the timer, the same way from every button: once per press (a second click while it saves does nothing), the
 * lists refresh, then the timer bar is told what was saved so it can ask "keep or discard?".
 */
export function useStopTimer() {
  const utils = trpc.useUtils();
  const stop = trpc.entry.stop.useMutation();
  const busy = useRef(false);
  /** `minutesAgo` stops the timer at an earlier moment ("Still working?"); left out, it stops now. */
  async function stopTimer(minutesAgo?: number) {
    if (busy.current) return;
    busy.current = true;
    try {
      const e = await stop.mutateAsync(minutesAgo ? { minutesAgo } : undefined);
      await Promise.all([
        utils.entry.running.invalidate(),
        utils.entry.list.invalidate(),
        utils.project.budgets.invalidate(),
      ]);
      const detail: Stopped = {
        id: e.id,
        minutes: e.minutes,
        where: `${e.project.name} · ${e.project.client.name}`,
        note: e.note,
        projectId: e.project_id,
      };
      window.dispatchEvent(new CustomEvent<Stopped>(STOPPED_EVENT, { detail }));
    } catch (err) {
      toastError(err, "Couldn't stop the timer.");
    } finally {
      busy.current = false;
    }
  }
  return { stopTimer, stopping: stop.isPending };
}

/**
 * The timer bar above the add form. While a timer runs: a pulsing dot, the project and client, the elapsed h:mm:ss and
 * Stop (the day dial above already counts the running minutes; the tab title shows the time too). Once stopped, it does
 * not vanish (the form below would jump up under the pointer): it stays in place and asks whether to keep the time
 * (already saved) or discard it, then keeps it on its own after a while.
 */
export function TimerPanel() {
  const utils = trpc.useUtils();
  const running = trpc.entry.running.useQuery();
  const discard = trpc.entry.delete.useMutation();
  const { stopTimer, stopping } = useStopTimer();
  const [now, setNow] = useState(() => Date.now());
  const [stopped, setStopped] = useState<Stopped | null>(null);
  const lockedUntil = useRef(0);

  const entry = running.data?.started_at ? running.data : null;

  useEffect(() => {
    const onStopped = (e: Event) => {
      lockedUntil.current = Date.now() + TIMER_LOCK_MS;
      setStopped((e as CustomEvent<Stopped>).detail);
    };
    window.addEventListener(STOPPED_EVENT, onStopped);
    return () => window.removeEventListener(STOPPED_EVENT, onStopped);
  }, []);
  // A new timer replaces the question; after a while the time is simply kept.
  useEffect(() => {
    if (entry) setStopped(null);
  }, [entry]);
  useEffect(() => {
    if (!stopped) return;
    const id = setTimeout(() => setStopped(null), DECIDE_MS);
    return () => clearTimeout(id);
  }, [stopped]);

  useEffect(() => {
    if (!entry) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [entry]);

  const startedAt = entry?.started_at ? new Date(entry.started_at).getTime() : 0;
  const t = timerParts(Math.max(0, Math.floor((now - startedAt) / 1000)));

  useEffect(() => {
    if (!entry) return;
    const prev = document.title;
    document.title = `⏱ ${t.text} · ${entry.project.name} · UseHourly`;
    return () => {
      document.title = prev;
    };
  }, [entry, t.text]);

  async function onDiscard() {
    if (!stopped || Date.now() < lockedUntil.current) return;
    try {
      await discard.mutateAsync({ id: stopped.id });
      await Promise.all([utils.entry.list.invalidate(), utils.project.budgets.invalidate()]);
      setStopped(null);
      toast.success("Timer discarded. Nothing was saved.");
    } catch (err) {
      toastError(err, "Couldn't discard the time.");
    }
  }

  const shell =
    "flex min-h-[4.25rem] flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-card px-4 py-3 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10";

  if (!entry && stopped) {
    return (
      <section aria-label="Timer stopped" className={shell}>
        <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
          <CircleCheck className="size-5 shrink-0" aria-hidden />
          <p role="status" className="min-w-0 text-sm">
            <span className="font-semibold">Stopped · {formatDuration(stopped.minutes)} saved</span>
            <span className="text-muted-foreground"> to {stopped.where}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={discard.isPending}
            className="inline-flex h-11 items-center gap-2 rounded-full border px-4 font-medium text-sm transition-colors hover:border-foreground/40 disabled:opacity-60"
          >
            <Trash2 className="size-4" aria-hidden />
            Discard
          </button>
          <button
            type="button"
            onClick={() => Date.now() >= lockedUntil.current && setStopped(null)}
            className="inline-flex h-11 items-center rounded-full bg-foreground px-5 font-semibold text-background text-sm transition-opacity hover:opacity-90"
          >
            Keep
          </button>
        </div>
      </section>
    );
  }

  if (!entry) return null;

  return (
    <section aria-label="Timer running" className={shell}>
      <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
        <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-amber" aria-hidden />
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">Timer running</p>
          <p className="truncate font-medium">
            {entry.project.name}
            <span className="text-muted-foreground"> · {entry.project.client.name}</span>
          </p>
          {entry.note && <p className="line-clamp-1 break-words text-muted-foreground text-xs">{entry.note}</p>}
        </div>
      </div>
      <span role="timer" aria-live="off" className="font-display font-extrabold text-3xl tabular-nums leading-none">
        {t.text}
      </span>
      <button
        type="button"
        onClick={() => stopTimer()}
        disabled={stopping}
        className="group inline-flex h-11 items-center gap-2 rounded-full border bg-muted px-5 font-medium text-sm transition-colors hover:border-foreground/40 hover:bg-card disabled:opacity-60"
      >
        <span className="grid size-5 place-items-center rounded-full bg-amber text-[#1b1405]">
          <Square className="size-2.5" fill="currentColor" aria-hidden />
        </span>
        Stop
      </button>
    </section>
  );
}
