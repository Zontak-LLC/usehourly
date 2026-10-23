"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import { LUME } from "@/components/explorer-watch";
import { PALETTE } from "@/lib/palette";

/*
 * The D-1 (2026-10-23): UseHourly's digital watch. It tells the time ("TIME"); while a timer records it is a stopwatch
 * ("REC", the elapsed time ticking, the project under it); after a stop it holds the time ("SAVED"). A thin line along
 * the foot fills with `progress`. Five looks share the same modes and text, so the design can change without touching
 * what it says. Controls are not part of the watch: they go under it as `children`.
 */

export type WatchMode =
  | { kind: "time" }
  | { kind: "running"; seconds: number; label: string }
  | { kind: "stopped"; seconds: number; label: string };

export type WatchLook = "glass" | "lcd" | "dots" | "nixie" | "industrial";

const dayLine = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

/** The time, refreshed every second, or null until the page is in the browser (the server does not know the reader's time). */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function uses12h(): boolean {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 === true;
}

const two = (n: number) => String(n).padStart(2, "0");

/** Everything the watch says, whatever it looks like. */
function watchText(mode: WatchMode, now: Date | null, foot?: string) {
  if (mode.kind !== "time") {
    const s = mode.seconds;
    const big = `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
    return {
      tag: mode.kind === "running" ? "Rec" : "Saved",
      big,
      ghost: "8:88:88",
      small: "",
      side: "Chrono",
      under: mode.label,
      spoken: `Timer ${big}`,
    };
  }
  if (!now) return { tag: "Time", big: "", ghost: "88:88", small: "", side: "", under: "", spoken: "Time now" };
  const twelve = uses12h();
  const h = twelve ? now.getHours() % 12 || 12 : now.getHours();
  const big = `${twelve ? h : two(h)}:${two(now.getMinutes())}`;
  const ampm = twelve ? (now.getHours() < 12 ? "AM" : "PM") : "";
  return {
    tag: "Time",
    big,
    ghost: "88:88",
    small: two(now.getSeconds()),
    side: ampm,
    under: [dayLine.format(now), foot].filter(Boolean).join(" · "),
    spoken: `Time now ${big} ${ampm}`.trim(),
  };
}

type Text = ReturnType<typeof watchText>;

function ProgressLine({ value, track = "bg-white/10" }: { value?: number; track?: string }) {
  if (value === undefined) return null;
  return (
    <div aria-hidden className={`absolute inset-x-0 bottom-0 h-1 ${track}`}>
      <div
        className="h-full transition-[width] duration-700"
        style={{
          width: `${Math.min(1, Math.max(0, value)) * 100}%`,
          background: `linear-gradient(90deg, ${PALETTE.brandBlend.join(", ")})`,
        }}
      />
    </div>
  );
}

/** Big digits with the unlit segments behind them. */
function Digits({ t, className, style }: { t: Text; className: string; style?: CSSProperties }) {
  return (
    <span className={`relative inline-block ${className}`} style={style}>
      <span aria-hidden className="opacity-[0.08]">
        {t.ghost}
      </span>
      <span aria-hidden className="absolute inset-0 text-right">
        {t.big}
      </span>
    </span>
  );
}

function RecDot({ on, className = "" }: { on: boolean; className?: string }) {
  if (!on) return null;
  return (
    <span
      aria-hidden
      className={`inline-block size-2 rounded-full bg-[rgb(255_69_58)] motion-safe:animate-[blink_1.6s_ease-in-out_infinite] ${className}`}
    />
  );
}

/** 1 · Glass: smoked glass on the app's dark head, cream digits. */
function Glass({ t, rec, progress }: Face) {
  return (
    <div className="@container relative overflow-hidden rounded-2xl bg-black/35 px-4 pt-3 pb-4 shadow-[inset_0_2px_10px_rgb(0_0_0/0.6)] ring-1 ring-white/10">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[linear-gradient(180deg,rgb(255_255_255/0.07),transparent)]"
      />
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.25em]">
        <span className="flex items-center gap-1.5">
          <RecDot on={rec} />
          {t.tag}
        </span>
        <span className="opacity-60">{t.side}</span>
      </div>
      <p className="mt-2 flex items-end justify-center font-mono font-semibold tabular-nums leading-none">
        <Digits t={t} className="text-[clamp(2.4rem,11cqi,3.4rem)]" />
        {t.small && <span className="mb-1 ml-1 text-base opacity-60">{t.small}</span>}
      </p>
      <p className="mt-2 truncate text-center font-mono text-[11px] uppercase tracking-[0.2em] opacity-70">
        {t.under || " "}
      </p>
      <ProgressLine value={progress} />
    </div>
  );
}

/** 2 · Classic LCD: grey-green screen, dark slanted digits, button names engraved on the bezel. */
function Lcd({ t, rec, progress }: Face) {
  return (
    <div className="rounded-2xl bg-[rgb(28_30_32)] p-2.5 ring-1 ring-white/10">
      <div className="flex justify-between px-1 pb-1.5 font-mono text-[8px] text-white/50 uppercase tracking-[0.25em]">
        <span>Light</span>
        <span>Water resist</span>
        <span>Mode</span>
      </div>
      <div className="@container relative overflow-hidden rounded-md bg-[rgb(163_174_150)] px-3 pt-2 pb-3 text-[rgb(28_34_26)] shadow-[inset_0_2px_6px_rgb(0_0_0/0.4)]">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase">
          <span className="flex items-center gap-1">
            {rec && <span className="font-bold">●</span>}
            {t.tag}
          </span>
          <span>{t.side}</span>
        </div>
        <p className="mt-1 flex items-end justify-center font-bold font-mono italic tabular-nums leading-none">
          <Digits t={t} className="text-[clamp(2.4rem,12cqi,3.4rem)]" />
          {t.small && <span className="mb-1 ml-1 text-lg">{t.small}</span>}
        </p>
        <p className="mt-1 truncate text-center font-mono text-[10px] uppercase tracking-[0.15em]">{t.under || " "}</p>
        <ProgressLine value={progress} track="bg-black/10" />
      </div>
      <div className="flex justify-between px-1 pt-1.5 font-mono text-[8px] text-white/50 uppercase tracking-[0.25em]">
        <span>Reset</span>
        <span>Start · Stop</span>
      </div>
    </div>
  );
}

/** 3 · Dot matrix: pure black, white dot digits, a red REC dot. */
function Dots({ t, rec, progress }: Face) {
  const dots: CSSProperties = {
    WebkitMaskImage: "radial-gradient(circle, black 58%, transparent 61%)",
    WebkitMaskSize: "4px 4px",
    maskImage: "radial-gradient(circle, black 58%, transparent 61%)",
    maskSize: "4px 4px",
  };
  return (
    <div className="@container relative overflow-hidden rounded-2xl bg-black px-4 pt-3 pb-4 text-white ring-1 ring-white/15">
      <div className="flex items-center justify-between font-mono text-[10px] text-white/60 uppercase tracking-[0.3em]">
        <span>{t.tag}</span>
        {rec ? <RecDot on className="size-2.5" /> : <span>{t.side}</span>}
      </div>
      <p className="mt-3 flex items-end justify-center font-black font-mono tabular-nums leading-none">
        <span className="text-[clamp(2.6rem,13cqi,3.8rem)] tracking-tight" style={dots}>
          {t.big || " "}
        </span>
        {t.small && (
          <span className="mb-1 ml-1 text-lg text-white/60" style={dots}>
            {t.small}
          </span>
        )}
      </p>
      <p className="mt-3 truncate text-center font-mono text-[10px] text-white/55 uppercase tracking-[0.3em]">
        {t.under || " "}
      </p>
      <ProgressLine value={progress} />
    </div>
  );
}

/** 4 · Nixie: each digit glowing orange in its own glass tube. */
function Nixie({ t, rec, progress }: Face) {
  const glow: CSSProperties = { textShadow: "0 0 6px rgb(255 120 20), 0 0 16px rgb(255 90 0 / 0.7)" };
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[rgb(18_14_12)] px-3 pt-3 pb-4 ring-1 ring-[rgb(255_150_50/0.25)]">
      <div className="flex items-center justify-between font-mono text-[10px] text-[rgb(255_160_80/0.7)] uppercase tracking-[0.25em]">
        <span className="flex items-center gap-1.5">
          <RecDot on={rec} />
          {t.tag}
        </span>
        <span>{t.side}</span>
      </div>
      <p className="mt-3 flex items-center justify-center gap-[3px]">
        {(t.big || "--:--").split("").map((ch, i) =>
          ch === ":" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed positions in a time string
            <span key={i} className="text-2xl text-[rgb(255_140_40)] opacity-80" style={glow}>
              :
            </span>
          ) : (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed positions in a time string
              key={i}
              className="grid h-14 w-8 place-items-center rounded-t-full rounded-b-md bg-[linear-gradient(180deg,rgb(70_52_40/0.55),rgb(22_16_13/0.95))] font-light font-mono text-[2rem] text-[rgb(255_160_60)] ring-1 ring-[rgb(255_210_160/0.15)]"
              style={glow}
            >
              {ch}
            </span>
          ),
        )}
      </p>
      <p className="mt-3 truncate text-center font-mono text-[10px] text-[rgb(255_160_80/0.65)] uppercase tracking-[0.25em]">
        {[t.small && `:${t.small}`, t.under].filter(Boolean).join("  ") || " "}
      </p>
      <ProgressLine value={progress} />
    </div>
  );
}

/** 5 · Industrial: a warm grey body, a black display window, one yellow accent. */
function Industrial({ t, rec, progress }: Face) {
  return (
    <div className="rounded-2xl bg-[rgb(222_219_212)] p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.7)]">
      <div className="@container relative overflow-hidden rounded-xl bg-[rgb(24_24_22)] px-4 pt-3 pb-4 text-white">
        <div className="flex items-center justify-between font-medium text-[10px] text-white/55 uppercase tracking-[0.3em]">
          <span>{t.tag}</span>
          <span>{t.side}</span>
        </div>
        <p className="mt-2 flex items-end justify-center font-sans font-semibold tabular-nums leading-none tracking-tight">
          <span className="text-[clamp(2.4rem,12cqi,3.4rem)]">{t.big || " "}</span>
          {t.small && <span className="mb-1 ml-1 text-base text-white/50">{t.small}</span>}
        </p>
        <p className="mt-2 truncate text-center font-medium text-[10px] text-white/50 uppercase tracking-[0.25em]">
          {t.under || " "}
        </p>
        <ProgressLine value={progress} />
      </div>
      <div className="flex items-center justify-between px-1 pt-2.5">
        <span className="font-semibold text-[9px] text-[rgb(90_88_82)] uppercase tracking-[0.3em]">UseHourly</span>
        <span
          aria-hidden
          className={`size-3 rounded-full ${rec ? "bg-[rgb(245_196_0)] shadow-[0_0_8px_rgb(245_196_0)]" : "bg-[rgb(150_147_140)]"}`}
        />
      </div>
    </div>
  );
}

type Face = { t: Text; rec: boolean; progress?: number };
const FACES: Record<WatchLook, (p: Face) => ReactNode> = {
  glass: Glass,
  lcd: Lcd,
  dots: Dots,
  nixie: Nixie,
  industrial: Industrial,
};

export function DigitalWatch({
  mode,
  look = "glass",
  foot,
  progress,
  label = "Timer and clock",
  children,
}: {
  mode: WatchMode;
  look?: WatchLook;
  /** The small line under the digits in TIME mode ("0:46 today", "2:59 of 40:00 this week"). */
  foot?: string;
  /** 0 to 1 for the line along the foot; left out, no line. */
  progress?: number;
  label?: string;
  /** Controls under the display (the timer's buttons). */
  children?: ReactNode;
}) {
  const now = useNow();
  const t = watchText(mode, now, foot);
  const Face = FACES[look];
  return (
    <section
      aria-label={label}
      className="relative flex flex-col gap-4 overflow-hidden rounded-[28px] p-4 shadow-[var(--shadow-sheet)] ring-1 ring-white/10"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 15%, color-mix(in oklab, black 74%, var(--amber)) 0%, color-mix(in oklab, black 93%, var(--amber)) 70%)",
        color: LUME,
      }}
    >
      {/* Read out as one thing: the time now, or the timer's time. */}
      {mode.kind === "time" ? (
        <div role="img" aria-label={t.spoken}>
          <Face t={t} rec={false} progress={progress} />
        </div>
      ) : (
        <div role="timer" aria-live="off" aria-label={t.spoken}>
          <Face t={t} rec={mode.kind === "running"} progress={progress} />
        </div>
      )}
      {children && <div className="relative flex justify-center">{children}</div>}
    </section>
  );
}
