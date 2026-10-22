"use client";

import { useEffect, useState } from "react";

import { Square } from "lucide-react";

import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

function parts(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return { h, m, s, text: `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` };
}

/**
 * The running timer as a slim bar above the add form: a pulsing dot, the project and client, the elapsed time as
 * h:mm:ss, and one large Stop. It is not a second dial: the day dial above already counts the running minutes. It
 * also writes the running time into the browser tab's title. Renders nothing without a timer.
 */
export function TimerPanel() {
  const utils = trpc.useUtils();
  const running = trpc.entry.running.useQuery();
  const stop = trpc.entry.stop.useMutation();
  const [now, setNow] = useState(() => Date.now());

  const entry = running.data?.started_at ? running.data : null;
  useEffect(() => {
    if (!entry) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [entry]);

  const startedAt = entry?.started_at ? new Date(entry.started_at).getTime() : 0;
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const t = parts(elapsed);

  useEffect(() => {
    if (!entry) return;
    const prev = document.title;
    document.title = `⏱ ${t.text} · ${entry.project.name} · UseHourly`;
    return () => {
      document.title = prev;
    };
  }, [entry, t.text]);

  if (!entry) return null;

  async function onStop() {
    try {
      await stop.mutateAsync();
      await Promise.all([
        utils.entry.running.invalidate(),
        utils.entry.list.invalidate(),
        utils.project.budgets.invalidate(),
      ]);
    } catch (err) {
      toastError(err, "Couldn't stop the timer.");
    }
  }

  return (
    <section
      aria-label="Timer running"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-card px-4 py-3 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10"
    >
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
        onClick={onStop}
        disabled={stop.isPending}
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
