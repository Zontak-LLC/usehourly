"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SCREENS = [
  {
    id: "today",
    label: "Today",
    file: "1-today",
    title: "Log a day in seconds",
    text: "Type 1h30, tap a chip, press Enter. The dial fills as the day adds up, and your week sits right under it.",
  },
  {
    id: "week",
    label: "Week",
    file: "2-week",
    title: "The whole week at a glance",
    text: "Seven day tiles with each project stacked in its own colour. Pick a day to edit it, or share the week with a client.",
  },
  {
    id: "month",
    label: "Month",
    file: "3-month",
    title: "A calendar of what you did",
    text: "Day and week totals on a warm calendar. Add the same hours to several days at once.",
  },
  {
    id: "invoices",
    label: "Invoices",
    file: "4-invoices",
    title: "Paid, waiting, late",
    text: "Every invoice saved exactly as sent. Email it, share a private link, and mark it paid. A ring shows how much is in.",
  },
  {
    id: "clients",
    label: "Clients",
    file: "5-clients",
    title: "Clients, projects and rates",
    text: "Each client's projects with their rate and this month's hours, plus budgets that warn you before you pass them.",
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
          <source media="(max-width: 639px)" srcSet={`/landing/tour-phone/${screen.file}.webp?v=4`} />
          <img
            src={`/landing/tour/${screen.file}.webp?v=4`}
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
          <source media="(max-width: 639px)" srcSet={`/landing/tour-phone-dark/${screen.file}.webp?v=4`} />
          <img
            src={`/landing/tour-dark/${screen.file}.webp?v=4`}
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

/** Which screen is in front, from how far the tall track has scrolled past the top of the window. */
function useScrollStep(count: number) {
  const track = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const el = track.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const span = Math.max(1, rect.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / span));
      setStep(Math.min(count - 1, Math.floor(progress * count)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [count]);
  const goTo = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el) return;
      const span = Math.max(1, el.offsetHeight - window.innerHeight);
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + ((i + 0.5) / count) * span, behavior: "smooth" });
    },
    [count],
  );
  return { track, step, goTo };
}

/**
 * The real app as a deck of windows. The stage stays pinned while the page scrolls past it: each screen lifts off the
 * stack and the next one comes forward, with the captions on the left following along. Tapping a caption scrolls to it.
 */
export function LandingShowcase() {
  const { track, step, goTo } = useScrollStep(SCREENS.length);
  const screen = SCREENS[step];
  return (
    <div ref={track} className="relative" style={{ height: `${SCREENS.length * 70 + 30}vh` }}>
      <div className="sticky top-16 mx-auto grid max-w-6xl items-center gap-8 py-4 lg:min-h-[calc(100dvh-6rem)] lg:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
        <ol className="hidden flex-col gap-1 lg:flex" aria-label="Screens of the app">
          {SCREENS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === step ? "step" : undefined}
                className={`w-full rounded-xl border-l-4 py-2.5 pr-3 pl-4 text-left transition-colors ${
                  i === step
                    ? "border-amber bg-muted/60"
                    : "border-transparent text-foreground/60 hover:text-foreground"
                }`}
              >
                <span className="block font-bold font-display text-lg">{s.title}</span>
                {i === step && <span className="mt-1 block text-muted-foreground text-sm">{s.text}</span>}
              </button>
            </li>
          ))}
        </ol>
        <div className="lg:hidden">
          <p className="text-center">
            <span className="font-bold font-display text-xl">{screen.title}</span>
            <span className="mx-auto mt-1 block max-w-xl text-muted-foreground text-sm">{screen.text}</span>
          </p>
        </div>
        <div className="relative mx-auto w-full max-w-3xl pb-24">
          <div className="relative aspect-[9/14] w-full sm:aspect-[1000/900]">
            {SCREENS.map((s, i) => (
              <Card key={s.id} screen={s} offset={i - step} />
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2" aria-hidden>
            {SCREENS.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-amber" : "w-1.5 bg-foreground/25"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
