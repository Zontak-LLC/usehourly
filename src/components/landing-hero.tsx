"use client";

import { useEffect, useRef, useState } from "react";

import { DayDial } from "@/components/day-dial";
import { formatDuration } from "@/lib/duration";

type Row = { project: string; client: string; color: string; minutes: number };

/** What the hero "types", in order: the text in the time box, then the entry it makes. */
const SCRIPT: { typed: string; row: Row }[] = [
  { typed: "1.5", row: { project: "Website redesign", client: "Northwind Studio", color: "#4f6bf5", minutes: 90 } },
  { typed: "2h", row: { project: "Mobile app", client: "Fable Labs", color: "#1fa971", minutes: 120 } },
  { typed: "4h", row: { project: "Mobile app", client: "Fable Labs", color: "#1fa971", minutes: 240 } },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The home page's picture of the product: a day dial and a time box that type their own entries, one after another.
 * 1.5 becomes an hour and a half, 2h becomes two hours, and the dial fills toward the goal. It plays only while it is on
 * screen, and with reduced motion it shows the finished day.
 */
export function LandingHero() {
  const [typed, setTyped] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const total = rows.reduce((s, r) => s + r.minutes, 0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRows(SCRIPT.map((s) => s.row));
      return;
    }
    let live = false;
    let run = 0;
    async function play(token: number) {
      while (live && token === run) {
        setRows([]);
        setTyped("");
        await sleep(900);
        for (const step of SCRIPT) {
          for (let i = 1; i <= step.typed.length && live && token === run; i++) {
            setTyped(step.typed.slice(0, i));
            await sleep(260);
          }
          await sleep(500);
          if (!(live && token === run)) return;
          setRows((r) => [step.row, ...r]);
          setTyped("");
          await sleep(1500);
        }
        await sleep(3200);
      }
    }
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          live = e.isIntersecting;
          run++;
          if (live) void play(run);
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      live = false;
      run++;
      io.disconnect();
    };
  }, []);

  return (
    <div ref={box} className="grid items-start gap-4 text-left sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <DayDial minutes={total} weekMinutes={null} timerRunning={false} />
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-sheet)]">
          <p className="mb-2 font-mono text-[11px] text-muted-foreground uppercase tracking-widest">Add to the day</p>
          <div className="flex h-12 items-center rounded-xl border bg-muted px-3 font-mono text-lg" aria-hidden>
            {typed ? (
              <>
                {typed}
                <span className="ml-0.5 inline-block h-5 w-px animate-pulse bg-foreground" />
              </>
            ) : (
              <span className="font-sans text-base text-muted-foreground">Time: 1.5, 1:30 or 90m</span>
            )}
          </div>
        </div>
        <ul className="overflow-hidden rounded-2xl border bg-card" aria-label="Entries the demo adds">
          {rows.length === 0 && <li className="px-4 py-4 text-muted-foreground text-sm">Your day fills in here.</li>}
          {rows.map((r, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: the demo list only ever grows from the top, and the same entry can repeat
              key={`${r.project}-${r.minutes}-${rows.length - i}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 last:border-b-0 motion-safe:animate-[settle_.5s_cubic-bezier(.2,.8,.2,1)]"
            >
              <span className="size-2.5 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
              <span className="min-w-0">
                <span className="block truncate font-medium text-sm">{r.project}</span>
                <span className="block truncate text-muted-foreground text-xs">{r.client}</span>
              </span>
              <span className="font-bold font-mono text-lg tabular-nums">{formatDuration(r.minutes)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
