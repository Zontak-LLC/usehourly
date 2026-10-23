"use client";

import { type ReactNode, useEffect, useId, useState } from "react";

import { round3 } from "@/lib/round3";

/**
 * The one watch the site draws (the Explorer, chosen 2026-10-23): a polished case, an always-dark face (it reads the same
 * in light and dark mode), lume numerals at the quarters, lume batons between, a triangle at twelve and a hairline
 * coloured ring that fills to `fraction`. The hand points where the fill ends; a slim amber seconds hand sweeps once a
 * minute while `running`. Every dial, ring and clock picture on the site uses this, so they all look and move alike.
 */

/** Watch lume: a pale cream. */
export const LUME = "color-mix(in oklab, var(--amber) 12%, white)";
const FACE = "color-mix(in oklab, black 88%, var(--amber))";
const FACE_LIGHT = "color-mix(in oklab, black 78%, var(--amber))";
/** Brushed steel for the timer's buttons under the watch: the same in light and dark mode. */
export const STEEL = "linear-gradient(135deg, rgb(236 238 242), rgb(150 155 165) 50%, rgb(214 217 223))";

/** The motion every watch shares: the ring and the hand sweep to a new value on this curve. */
export const WATCH_EASE = "cubic-bezier(.2,.8,.2,1)";

const RING_R = 84;
const RING_LENGTH = 2 * Math.PI * RING_R;

/** Starts at zero and moves to `value` after the first paint, so the ring and hand sweep in the way every watch does. */
export function useSweepIn(value: number): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return shown;
}

/** A point on the dial: `turn` 0 is twelve o'clock, 1 is a full turn; `r` in the 200-unit viewBox. */
function at(turn: number, r: number) {
  const a = turn * Math.PI * 2;
  return { x: round3(100 + r * Math.sin(a)), y: round3(100 - r * Math.cos(a)) };
}

/**
 * The layout for `n` markers: a minute track of 6 ticks per marker, numerals at the quarters (2, 4, 6 round an 8 hour day;
 * 3, 6, 9 round 12), a triangle at twelve and lume batons everywhere else. With a window at six, the six numeral and the
 * ticks behind the window make room for it.
 */
function layout(n: number, windowAtSix: boolean) {
  const ticks = Array.from({ length: n * 6 }, (_, i) => i)
    .filter((i) => i % 6 !== 0 && !(windowAtSix && Math.abs(i / (n * 6) - 0.5) < 0.07))
    .map((i) => ({ key: i, a: at(i / (n * 6), 78), b: at(i / (n * 6), 75) }));
  const numerals: { turn: number; label: string }[] = [];
  const batons: number[] = [];
  for (let i = 1; i < n; i++) {
    const turn = i / n;
    const quarter = n % 4 === 0 && i % (n / 4) === 0;
    if (quarter && !(windowAtSix && turn === 0.5)) numerals.push({ turn, label: String(i) });
    else if (!quarter) batons.push(turn);
  }
  return { ticks, numerals, batons };
}

export function ExplorerWatch({
  fraction,
  ring,
  marks = 12,
  windowAtSix = false,
  running = false,
  simple = false,
  brand = false,
  clock = false,
  duration = 1.1,
  className = "",
  children,
}: {
  /** 0 to 1: how far the ring fills and where the hand points. */
  fraction: number;
  /** Colours for the ring (a gradient round the dial); plain amber when left out. */
  ring?: readonly string[];
  /** Markers round the face (Today: one per working hour). The quarters carry numerals. */
  marks?: number;
  /** Leave six o'clock free for a small window (Today's stopwatch). */
  windowAtSix?: boolean;
  /** A timer runs: the seconds hand sweeps and the centre turns amber. */
  running?: boolean;
  /** For small sizes: no minute track and no numerals, only batons, the triangle and the hand. */
  simple?: boolean;
  /** Print the maker's name under twelve, as a watch does (big dials only: it is too small to read on little ones). */
  brand?: boolean;
  /**
   * A plain watch telling the current time (the Week page): hour, minute and a sweeping seconds hand, the date in a
   * window at three, no progress ring. `fraction` and `running` are then ignored.
   */
  clock?: boolean;
  /** Seconds the ring and hand take to sweep to a new value. */
  duration?: number;
  className?: string;
  /** Printing on the dial (figures, a window), drawn between the face and the hands. */
  children?: ReactNode;
}) {
  const uid = useId().replace(/:/g, "");
  const face = layout(marks, windowAtSix);
  const now = useNow(clock);
  const numerals = clock ? face.numerals.filter((m) => m.turn !== 0.25) : face.numerals;
  const f = Math.min(1, Math.max(0, fraction));
  const sweep = `${duration}s ${WATCH_EASE}`;
  return (
    <div className={`@container relative aspect-square ${className}`}>
      <svg viewBox="0 0 200 200" className="size-full overflow-visible" aria-hidden>
        <defs>
          {ring && ring.length > 1 && (
            <linearGradient id={`${uid}-ring`} x1="1" y1="0" x2="0" y2="1">
              {ring.map((c, i) => (
                <stop key={c} offset={i / (ring.length - 1)} stopColor={c} />
              ))}
            </linearGradient>
          )}
          <linearGradient id={`${uid}-case`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="color-mix(in oklab, var(--foreground) 10%, var(--card))" />
            <stop offset="0.5" stopColor="color-mix(in oklab, var(--foreground) 35%, var(--card))" />
            <stop offset="1" stopColor="color-mix(in oklab, var(--foreground) 12%, var(--card))" />
          </linearGradient>
          <radialGradient id={`${uid}-face`} cx="0.5" cy="0.4" r="0.65">
            <stop offset="0" stopColor={FACE_LIGHT} />
            <stop offset="1" stopColor={FACE} />
          </radialGradient>
        </defs>
        {!simple && (
          <>
            {/* The crown at three o'clock, with its grip. */}
            <rect x="197" y="91" width="7" height="18" rx="2" fill="var(--border)" />
            {[95, 100, 105].map((y) => (
              <line key={y} x1="198.5" y1={y} x2="202.5" y2={y} stroke="var(--card)" strokeWidth="0.8" />
            ))}
          </>
        )}
        <circle cx="100" cy="100" r="96" fill={`url(#${uid}-case)`} />
        <circle cx="100" cy="100" r="88" fill={`url(#${uid}-face)`} />
        {!clock && <circle cx="100" cy="100" r={RING_R} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="5" />}
        <circle
          display={clock ? "none" : undefined}
          cx="100"
          cy="100"
          r={RING_R}
          fill="none"
          stroke={ring && ring.length > 1 ? `url(#${uid}-ring)` : (ring?.[0] ?? "var(--amber)")}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - f)}
          transform="rotate(-90 100 100)"
          style={{ transition: `stroke-dashoffset ${sweep}` }}
        />
        {!simple &&
          face.ticks.map((t) => (
            <line
              key={t.key}
              x1={t.a.x}
              y1={t.a.y}
              x2={t.b.x}
              y2={t.b.y}
              stroke="rgb(255 255 255 / 0.4)"
              strokeWidth="0.8"
            />
          ))}
        {(simple ? [0.25, 0.5, 0.75] : face.batons).map((turn) => (
          <g key={turn} transform={`rotate(${turn * 360} 100 100)`}>
            <rect x="97" y="24" width="6" height="14" rx="1" fill="white" />
            <rect x="98.4" y="25.5" width="3.2" height="11" rx="0.8" fill={LUME} />
          </g>
        ))}
        <path d="M100 42 L92 24 L108 24 Z" fill={LUME} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
        {brand && !simple && (
          <text
            x="100"
            y="55"
            textAnchor="middle"
            fill="rgb(255 255 255 / 0.88)"
            fontSize="8.5"
            fontWeight="700"
            letterSpacing="1.8"
            fontFamily="var(--font-display)"
          >
            USEHOURLY
          </text>
        )}
        {!simple &&
          numerals.map((m) => {
            const p = at(m.turn, 66);
            return (
              <text
                key={m.turn}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={LUME}
                fontSize="20"
                fontWeight="800"
                fontFamily="var(--font-display)"
              >
                {m.label}
              </text>
            );
          })}
        {clock && now && (
          // The date window at three o'clock, as on a Rolex.
          <g>
            <rect x="146" y="91" width="22" height="18" rx="2" fill="white" stroke="rgb(0 0 0 / 0.5)" strokeWidth="1" />
            <text
              x="157"
              y="100.5"
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgb(18 21 27)"
              fontSize="12"
              fontWeight="700"
              fontFamily="var(--font-display)"
            >
              {now.getDate()}
            </text>
          </g>
        )}
      </svg>
      {children}
      {/* The hands ride above the printing, as on a watch: a thin needle at the pivot, a lume sword at the tip. */}
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
        {clock ? (
          now && <ClockHands now={now} />
        ) : (
          <>
            <g
              style={{
                transformOrigin: "100px 100px",
                transform: `rotate(${f * 360}deg)`,
                transition: `transform ${sweep}`,
                filter: "drop-shadow(0 1.5px 1.5px rgb(0 0 0 / 0.3))",
              }}
            >
              <rect x="99" y="62" width="2" height="46" rx="1" fill="white" />
              <path d="M100 30 L104.5 40 L103.4 64 L96.6 64 L95.5 40 Z" fill="white" />
              <path d="M100 34 L102.4 41 L101.8 61 L98.2 61 L97.6 41 Z" fill={LUME} />
            </g>
            {running && (
              <g
                className="motion-safe:animate-[spin_60s_linear_infinite]"
                style={{ transformOrigin: "100px 100px", filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.3))" }}
              >
                <line
                  x1="100"
                  y1="118"
                  x2="100"
                  y2="20"
                  stroke="var(--amber)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                <circle cx="100" cy="34" r="3" fill={FACE} stroke="var(--amber)" strokeWidth="1.3" />
              </g>
            )}
          </>
        )}
        <circle cx="100" cy="100" r="4" fill="white" />
        <circle cx="100" cy="100" r="1.5" fill={running || clock ? "var(--amber)" : FACE} />
      </svg>
    </div>
  );
}

/**
 * The time, refreshed every second, or null until the page is in the browser (the server's time is not the reader's,
 * so the hands only appear once mounted: no mismatch between the server's page and the browser's).
 */
function useNow(on: boolean): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (!on) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return now;
}

/** Hour and minute hands (lume swords) and a seconds hand that sweeps smoothly, started where the clock really is. */
function ClockHands({ now }: { now: Date }) {
  const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;
  // The seconds hand is one CSS turn a minute, started at the right second once (the delay is read on first render).
  const [startAt] = useState(() => -seconds);
  const shadow = "drop-shadow(0 1.5px 1.5px rgb(0 0 0 / 0.3))";
  return (
    <>
      <g transform={`rotate(${hours * 30} 100 100)`} style={{ filter: shadow }}>
        <rect x="98.8" y="76" width="2.4" height="32" rx="1.2" fill="white" />
        <path d="M100 48 L105.5 58 L104.2 78 L95.8 78 L94.5 58 Z" fill="white" />
        <path d="M100 52 L103.2 59 L102.4 75 L97.6 75 L96.8 59 Z" fill={LUME} />
      </g>
      <g transform={`rotate(${minutes * 6} 100 100)`} style={{ filter: shadow }}>
        <rect x="99" y="62" width="2" height="46" rx="1" fill="white" />
        <path d="M100 26 L104.5 36 L103.4 64 L96.6 64 L95.5 36 Z" fill="white" />
        <path d="M100 30 L102.4 37 L101.8 61 L98.2 61 L97.6 37 Z" fill={LUME} />
      </g>
      <g
        className="motion-safe:animate-[spin_60s_linear_infinite]"
        style={{ transformOrigin: "100px 100px", animationDelay: `${startAt}s`, filter: shadow }}
      >
        <line x1="100" y1="118" x2="100" y2="20" stroke="var(--amber)" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="100" cy="34" r="3" fill={FACE} stroke="var(--amber)" strokeWidth="1.3" />
      </g>
    </>
  );
}
