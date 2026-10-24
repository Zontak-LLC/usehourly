"use client";

import { useRef, useState } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

// Two screens, the start and the end of the story (2026-10-24, the owner: "two would do"): logging a day, and the
// invoices it turns into. The other pictures stay in public/landing for the Play Store listing.
const SCREENS = [
  {
    id: "today",
    label: "Today",
    file: "1-today",
    title: "Log a day in seconds",
    text: "Type 1h30 or tap a quick time, pick the project, press Enter. A timer is there when you want one.",
  },
  {
    id: "invoices",
    label: "Invoices",
    file: "4-invoices",
    title: "Paid, waiting, late",
    text: "Every invoice saved exactly as sent. Download the PDF, share a private link, and mark it paid.",
  },
] as const;

type Screen = (typeof SCREENS)[number];

/** Where a card sits relative to the front one: flown away, the front, or waiting behind it (peeking at the foot). */
function cardStyle(offset: number): React.CSSProperties {
  if (offset < 0) {
    return {
      transform: "translate(-14%, -16%) rotate(-7deg) scale(0.94)",
      opacity: 0,
      pointerEvents: "none",
      zIndex: 40,
    };
  }
  const behind = Math.min(offset, 4);
  return {
    transform: `translateY(${behind * 22}px) scale(${1 - behind * 0.05})`,
    opacity: offset > 3 ? 0 : 1 - behind * 0.16,
    zIndex: 30 - offset,
  };
}

function Card({ screen, offset }: { screen: Screen; offset: number }) {
  return (
    <div
      aria-hidden={offset !== 0}
      style={cardStyle(offset)}
      className="absolute inset-0 flex origin-top flex-col overflow-hidden rounded-2xl bg-card shadow-[0_30px_80px_-30px_rgba(18,21,27,0.5)] ring-1 ring-foreground/10 transition-[transform,opacity] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
    >
      <div aria-hidden className="flex items-center gap-1.5 border-foreground/10 border-b bg-muted/60 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[#FF5F57]" />
        <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="size-2.5 rounded-full bg-[#28C840]" />
        <span className="ml-3 rounded-md bg-card px-3 py-0.5 font-mono text-[11px] text-foreground/70">
          usehourly.app/dashboard/{screen.id}
        </span>
      </div>
      {/* The light picture on a light page, the dark one on a dark page. Both are a 1120x1008 window (10:9, the deck's own
          shape, issue 221), so the app fills the window instead of floating small in a 1440-wide page. A phone gets the phone picture of each: the
          desktop screen shrunk to a phone is too small to read. */}
      <div className="min-h-0 flex-1 dark:hidden">
        <picture className="block size-full">
          <source media="(max-width: 639px)" srcSet={`/landing/tour-phone/${screen.file}.webp?v=11`} />
          <img
            src={`/landing/tour/${screen.file}.webp?v=11`}
            alt={offset === 0 ? `The ${screen.label} screen of UseHourly: ${screen.title.toLowerCase()}` : ""}
            width={1400}
            height={1260}
            loading="lazy"
            decoding="async"
            className="size-full object-cover object-top"
          />
        </picture>
      </div>
      <div className="hidden min-h-0 flex-1 dark:block">
        <picture className="block size-full">
          <source media="(max-width: 639px)" srcSet={`/landing/tour-phone-dark/${screen.file}.webp?v=11`} />
          <img
            src={`/landing/tour-dark/${screen.file}.webp?v=11`}
            alt=""
            width={1400}
            height={1260}
            loading="lazy"
            decoding="async"
            className="size-full object-cover object-top"
          />
        </picture>
      </div>
    </div>
  );
}

/**
 * The real app as a deck of windows you flip through (2026-10-23: it used to flip only by scrolling a tall pinned
 * track, which was hard to move through on a desktop and made the page long). Tabs name each screen, the arrows and the
 * dots step through them, the left and right arrow keys work when the deck has focus, and a swipe works on a touch
 * screen. The front window lifts off and the next one comes forward; nothing moves on its own.
 */
export function LandingShowcase() {
  const [step, setStep] = useState(0);
  const count = SCREENS.length;
  const go = (i: number) => setStep(((i % count) + count) % count);
  const screen = SCREENS[step];
  const touch = useRef<number | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const arrow =
    "grid size-11 place-items-center rounded-full bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 transition-transform hover:scale-105 active:scale-95";

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Screens of the app"
      onKeyDown={(e) => {
        const move = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!move) return;
        e.preventDefault();
        const next = (((step + move) % count) + count) % count;
        go(next);
        // On a tab, focus follows the selection (the tab pattern), so a screen reader is not left on a deselected tab.
        if ((e.target as HTMLElement).getAttribute("role") === "tab") tabs.current[next]?.focus();
      }}
      className="mx-auto max-w-6xl"
    >
      <div role="tablist" aria-label="Screens" className="flex flex-wrap justify-center gap-2">
        {SCREENS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`screen-tab-${s.id}`}
            aria-controls="screen-panel"
            ref={(el) => {
              tabs.current[i] = el;
            }}
            aria-selected={i === step}
            tabIndex={i === step ? 0 : -1}
            onClick={() => go(i)}
            className={`h-10 rounded-full px-4 font-medium text-sm transition-colors ${
              i === step
                ? "bg-foreground text-background"
                : "bg-card text-foreground/70 ring-1 ring-foreground/10 hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* The caption sits right above the window it describes (issue 252: beside it, it floated in an empty column).
          It keeps the room of two lines, so the window never jumps when a shorter caption comes in. */}
      <div className="mx-auto mt-6 max-w-2xl text-center" aria-live="polite">
        <h3 className="flex min-h-[4.5rem] items-end justify-center font-bold font-display text-2xl text-balance sm:min-h-0 sm:text-3xl">
          {screen.title}
        </h3>
        <p className="mt-2 min-h-[6.5rem] text-pretty text-muted-foreground sm:min-h-[3.5rem] sm:text-lg">
          {screen.text}
        </p>
      </div>

      <div className="mt-4">
        <div className="relative mx-auto w-full max-w-4xl pb-16">
          <div
            role="tabpanel"
            id="screen-panel"
            aria-labelledby={`screen-tab-${screen.id}`}
            className="relative aspect-[9/14] w-full touch-pan-y sm:aspect-[10/9]"
            onTouchStart={(e) => {
              touch.current = e.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(e) => {
              const start = touch.current;
              touch.current = null;
              const end = e.changedTouches[0]?.clientX;
              if (start === null || end === undefined || Math.abs(end - start) < 50) return;
              go(end < start ? step + 1 : step - 1);
            }}
          >
            {SCREENS.map((s, i) => (
              <Card key={s.id} screen={s} offset={i - step} />
            ))}
          </div>
          {/* Below the window, in one row: the arrows on either side of the dots (issue 252: on the window's sides they
              crowded the picture). */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3">
            <button type="button" aria-label="Previous screen" onClick={() => go(step - 1)} className={arrow}>
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <div className="flex items-center gap-1">
              {SCREENS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Show the ${s.label} screen`}
                  aria-current={i === step ? "true" : undefined}
                  onClick={() => go(i)}
                  className="grid h-8 place-items-center px-1"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-amber" : "w-1.5 bg-foreground/25"}`}
                  />
                </button>
              ))}
            </div>
            <button type="button" aria-label="Next screen" onClick={() => go(step + 1)} className={arrow}>
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
