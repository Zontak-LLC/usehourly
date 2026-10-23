"use client";

/*
 * The D-1: a digital watch drawn for the home page story (the app itself draws no clocks since 2026-10-23). Idle it
 * shows a day's hours ("TODAY", h:mm); while recording it is a stopwatch ("REC", the time ticking, a label under it).
 */

/** Watch lume: a pale cream. */
const LUME = "color-mix(in oklab, var(--amber) 12%, white)";

export type WatchMode = { kind: "total"; minutes: number } | { kind: "running"; seconds: number; label: string };

const two = (n: number) => String(n).padStart(2, "0");

/** Everything the watch says, whatever it looks like. */
function watchText(mode: WatchMode) {
  if (mode.kind === "total") {
    const big = `${Math.floor(mode.minutes / 60)}:${two(mode.minutes % 60)}`;
    return {
      tag: "Today",
      big,
      ghost: "88:88",
      small: "",
      side: "",
      under: "",
      spoken: `Logged today ${big}`,
    };
  }
  const s = mode.seconds;
  const big = `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
  return {
    tag: "Rec",
    big,
    ghost: "8:88:88",
    small: "",
    side: "Chrono",
    under: mode.label,
    spoken: `Timer ${big}`,
  };
}

type Text = ReturnType<typeof watchText>;

/** Big digits with the unlit segments behind them. */
function Digits({ t, className }: { t: Text; className: string }) {
  return (
    <span className={`relative inline-block ${className}`}>
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

/** Smoked glass, cream digits. */
function Glass({ t, rec }: { t: Text; rec: boolean }) {
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
    </div>
  );
}

export function DigitalWatch({ mode, label }: { mode: WatchMode; label: string }) {
  const t = watchText(mode);
  return (
    <section
      aria-label={label}
      className="relative overflow-hidden rounded-[28px] p-4 shadow-[var(--shadow-sheet)] ring-1 ring-white/10"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 15%, color-mix(in oklab, black 74%, var(--amber)) 0%, color-mix(in oklab, black 93%, var(--amber)) 70%)",
        color: LUME,
      }}
    >
      {/* Read out as one thing: the day's hours, or the stopwatch's time. */}
      <div role="img" aria-label={t.spoken}>
        <Glass t={t} rec={mode.kind === "running"} />
      </div>
    </section>
  );
}
