"use client";

import { useRef, useState } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

const SCREENS = [
  {
    id: "today",
    label: "Today",
    file: "1-today",
    title: "Log a day in seconds",
    text: "Type 1h30 or tap a quick time, pick the project, press Enter. A timer is there when you want one.",
  },
  {
    id: "week",
    label: "Week",
    file: "2-week",
    title: "The whole week at a glance",
    text: "Seven day tiles with their totals. A weekday with no time stands out, so nothing slips through.",
  },
  {
    id: "month",
    label: "Month",
    file: "3-month",
    title: "A calendar of what you did",
    text: "Day and week totals on one calendar. Logged on the wrong day? Drag the entry onto the right one.",
  },
  {
    id: "invoices",
    label: "Invoices",
    file: "4-invoices",
    title: "Paid, waiting, late",
    text: "Every invoice saved exactly as sent. Download the PDF, share a private link, and mark it paid.",
  },
  {
    id: "clients",
    label: "Clients",
    file: "5-clients",
    title: "Clients, projects and rates",
    text: "Each client's month in hours and money, the rate on every project, and Make invoice one tap away.",
  },
  {
    id: "year",
    label: "Year summary",
    file: "6-year",
    title: "Ready for tax time",
    text: "Hours, earned, invoiced and received for the year, month by month, with an Excel export for your accountant.",
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
          usehourly.app/dashboard/{screen.id === "year" ? "report" : screen.id}
        </span>
      </div>
      {/* The light picture on a light page, the dark one on a dark page. A phone gets the phone picture of each: the
          desktop screen shrunk to a phone is too small to read. */}
      <div className="min-h-0 flex-1 dark:hidden">
        <picture className="block size-full">
          <source media="(max-width: 639px)" srcSet={`/landing/tour-phone/${screen.file}.webp?v=7`} />
          <img
            src={`/landing/tour/${screen.file}.webp?v=7`}
            alt={offset === 0 ? `The ${screen.label} screen of UseHourly: ${screen.title.toLowerCase()}` : ""}
            width={1440}
            height={1240}
            loading="lazy"
            decoding="async"
            className="size-full object-cover object-top"
          />
        </picture>
      </div>
      <div className="hidden min-h-0 flex-1 dark:block">
        <picture className="block size-full">
          <source media="(max-width: 639px)" srcSet={`/landing/tour-phone-dark/${screen.file}.webp?v=7`} />
          <img
            src={`/landing/tour-dark/${screen.file}.webp?v=7`}
            alt=""
            width={1000}
            height={862}
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
  const arrow =
    "grid size-11 place-items-center rounded-full bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 transition-transform hover:scale-105 active:scale-95";

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Screens of the app"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(step + 1);
        else if (e.key === "ArrowLeft") go(step - 1);
        else return;
        e.preventDefault();
      }}
      className="mx-auto max-w-6xl"
    >
      <div role="tablist" aria-label="Screens" className="flex flex-wrap justify-center gap-2">
        {SCREENS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
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

      <div className="mt-8 grid items-center gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
        <div className="text-center lg:text-left" aria-live="polite">
          <p className="font-mono text-muted-foreground text-xs uppercase tracking-widest">
            {step + 1} / {count}
          </p>
          <h3 className="mt-2 font-bold font-display text-2xl">{screen.title}</h3>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground lg:mx-0">{screen.text}</p>
        </div>
        <div className="relative mx-auto w-full max-w-3xl pb-14">
          <div
            role="tabpanel"
            aria-label={screen.label}
            className="relative aspect-[9/14] w-full touch-pan-y sm:aspect-[1000/900]"
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
          <button
            type="button"
            aria-label="Previous screen"
            onClick={() => go(step - 1)}
            className={`absolute top-[45%] -left-4 z-50 hidden sm:grid lg:-left-6 ${arrow}`}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next screen"
            onClick={() => go(step + 1)}
            className={`absolute top-[45%] -right-4 z-50 hidden sm:grid lg:-right-6 ${arrow}`}
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1">
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
        </div>
      </div>
    </section>
  );
}
