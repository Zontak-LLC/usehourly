"use client";

import { useEffect, useState } from "react";

import { Square } from "lucide-react";

import { round3 } from "@/lib/round3";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

function parts(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return { h, m, s, text: `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` };
}

const RING = 2 * Math.PI * 78;
const TICKS = Array.from({ length: 60 }, (_, i) => {
  const a = (i / 60) * Math.PI * 2;
  const long = i % 5 === 0;
  const r2 = long ? 88 : 92;
  return {
    key: i,
    x1: round3(100 + 96 * Math.sin(a)),
    y1: round3(100 - 96 * Math.cos(a)),
    x2: round3(100 + r2 * Math.sin(a)),
    y2: round3(100 - r2 * Math.cos(a)),
    long,
  };
});

/**
 * The running timer, as a live clock that sits under the week on Today, and looks like the day dial above it (the same
 * thick amber ring, ticks and soft glow) with its own face: 60 ticks for the seconds, a ring that sweeps once a minute,
 * the elapsed hours and minutes in the middle, and the project under it. Stop is one large button. It also writes the
 * running time into the browser tab's title. Renders nothing without a timer.
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

  const sweep = (t.s === 0 ? 60 : t.s) / 60;
  const noTransition = t.s === 0;
  return (
    <section
      aria-label="Timer running"
      className="relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl border bg-card p-5 shadow-[var(--shadow-sheet)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-20%] bottom-[-45%] h-[70%] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--amber)_22%,transparent),transparent)]"
      />
      <p className="relative flex w-full items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
        <span className="size-2 animate-pulse rounded-full bg-amber" aria-hidden />
        Timer running
      </p>
      <div className="relative aspect-square w-full max-w-[210px]">
        <svg viewBox="0 0 200 200" className="size-full overflow-visible" aria-hidden>
          <title>Seconds</title>
          {TICKS.map((k) => (
            <line
              key={k.key}
              x1={k.x1}
              y1={k.y1}
              x2={k.x2}
              y2={k.y2}
              stroke="var(--border)"
              strokeWidth={k.long ? 2 : 1}
            />
          ))}
          <circle cx="100" cy="100" r="78" fill="none" stroke="var(--muted)" strokeWidth="14" />
          <circle
            cx="100"
            cy="100"
            r="78"
            fill="none"
            stroke="var(--amber)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - sweep)}
            transform="rotate(-90 100 100)"
            style={{ transition: noTransition ? "none" : "stroke-dashoffset 1s linear" }}
          />
          <g
            style={{
              transformOrigin: "100px 100px",
              transform: `rotate(${sweep * 360}deg)`,
              transition: noTransition ? "none" : "transform 1s linear",
            }}
          >
            <line x1="100" y1="40" x2="100" y2="8" stroke="var(--foreground)" strokeWidth="3" strokeLinecap="round" />
            <circle cx="100" cy="22" r="4" fill="var(--card)" stroke="var(--foreground)" strokeWidth="2" />
          </g>
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">Elapsed</span>
          <span className="font-display font-extrabold text-5xl tabular-nums leading-none" role="timer" aria-live="off">
            {t.h}:{String(t.m).padStart(2, "0")}
          </span>
          <span className="mt-1 font-mono text-[11px] text-muted-foreground uppercase tabular-nums tracking-widest">
            :{String(t.s).padStart(2, "0")}
          </span>
        </div>
      </div>
      <div className="relative w-full text-center">
        <p className="truncate font-medium text-sm">{entry.project.name}</p>
        <p className="truncate text-muted-foreground text-xs">{entry.project.client.name}</p>
        {entry.note && <p className="mt-1 line-clamp-2 break-words text-muted-foreground text-xs">{entry.note}</p>}
      </div>
      <button
        type="button"
        onClick={onStop}
        disabled={stop.isPending}
        className="group relative inline-flex h-10 items-center gap-2 rounded-full border bg-muted px-5 font-medium text-sm transition-colors hover:border-foreground/40 hover:bg-card disabled:opacity-60"
      >
        <span className="grid size-5 place-items-center rounded-full bg-amber text-[#1b1405]">
          <Square className="size-2.5" fill="currentColor" aria-hidden />
        </span>
        Stop
      </button>
    </section>
  );
}
