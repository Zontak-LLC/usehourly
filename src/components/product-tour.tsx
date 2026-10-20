"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Pause, Play } from "lucide-react";

import { startTour } from "@/lib/tour-loop";
import { TOUR_SWIPE_MS } from "@/lib/tour-timing";

const SLIDES = [
  { id: "today", label: "Today", alt: "UseHourly: the Today screen, where a day is logged in seconds" },
  { id: "week", label: "Week", alt: "UseHourly: the weekly timesheet" },
  { id: "month", label: "Month", alt: "UseHourly: the month calendar with day and week totals" },
  { id: "invoices", label: "Invoices", alt: "UseHourly: invoices" },
  { id: "clients", label: "Clients", alt: "UseHourly: clients and projects with rates and budgets" },
  { id: "year", label: "Year summary", alt: "UseHourly: the year summary for taxes" },
] as const;
const FILE = ["1-today", "2-week", "3-month", "4-invoices", "5-clients", "6-year"];

/**
 * A silent tour of the app for the top of the landing page: each screen scrolls down inside a browser window (a phone on
 * a small screen), then slides sideways to the next, and round again. It stands still while the pointer or keyboard
 * focus is on it, while it is off screen or the tab is hidden, and when the visitor chose Pause or asked their system for
 * less motion; the dots go to any screen at once. Pictures after the first load only when they are about to be needed.
 */
export function ProductTour() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const imgs = useRef<(HTMLImageElement | null)[]>([]);
  // What the running loop reads: the person's wishes and where the pointer, focus and viewport are.
  const state = useRef({
    index: 0,
    paused: false,
    hover: false,
    focus: false,
    visible: true,
    jump: null as number | null,
  });
  state.current.paused = paused;

  const goTo = useCallback((i: number) => {
    state.current.jump = i;
    state.current.index = i;
    setIndex(i);
  }, []);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = root.current;
    const watch = el
      ? new IntersectionObserver(([e]) => {
          state.current.visible = e.isIntersecting;
        })
      : null;
    if (el && watch) watch.observe(el);
    return () => watch?.disconnect();
  }, []);

  useEffect(() => {
    if (reduced.current) return;
    return startTour({
      state: state.current,
      count: SLIDES.length,
      screen: () => screen.current,
      track: () => track.current,
      image: (i) => imgs.current[i],
      setIndex,
    });
  }, []);

  // With reduced motion there is no loop: the dots move the track themselves.
  useEffect(() => {
    if (reduced.current && track.current) track.current.style.transform = `translateX(${-100 * index}%)`;
  }, [index]);

  return (
    <section
      ref={root}
      aria-roledescription="carousel"
      aria-label="A tour of UseHourly"
      className="mx-auto w-full max-w-5xl"
      onMouseEnter={() => {
        state.current.hover = true;
      }}
      onMouseLeave={() => {
        state.current.hover = false;
      }}
      onFocus={() => {
        state.current.focus = true;
      }}
      onBlur={() => {
        state.current.focus = false;
      }}
    >
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm max-sm:mx-auto max-sm:max-w-[19rem] max-sm:rounded-[2rem] max-sm:border-4 max-sm:border-foreground/80">
        <div className="flex h-9 items-center gap-3 border-b bg-muted/60 px-4 max-sm:hidden" aria-hidden>
          <span className="flex gap-1.5">
            <i className="size-2.5 rounded-full bg-foreground/15" />
            <i className="size-2.5 rounded-full bg-foreground/15" />
            <i className="size-2.5 rounded-full bg-foreground/15" />
          </span>
          <span className="mx-auto flex h-6 w-72 max-w-full items-center justify-center rounded-md border bg-background text-muted-foreground text-xs">
            usehourly.app
          </span>
          <span className="w-10" />
        </div>
        <div
          ref={screen}
          className="relative overflow-hidden bg-background [aspect-ratio:1440/1000] max-sm:[aspect-ratio:9/16]"
          aria-live="off"
        >
          <div
            ref={track}
            className="flex h-full will-change-transform"
            style={{ transition: `transform ${TOUR_SWIPE_MS}ms cubic-bezier(.4,0,.2,1)` }}
          >
            {SLIDES.map((s, i) => (
              <div key={s.id} className="h-full w-full shrink-0 overflow-hidden" aria-hidden={i !== index}>
                <picture>
                  <source media="(max-width: 639px)" srcSet={`/landing/tour-phone/${FILE[i]}.webp`} />
                  <img
                    ref={(el) => {
                      imgs.current[i] = el;
                    }}
                    src={`/landing/tour/${FILE[i]}.webp`}
                    alt={s.alt}
                    width={1440}
                    height={1240}
                    loading={i === 0 ? "eager" : "lazy"}
                    fetchPriority={i === 0 ? "high" : "auto"}
                    decoding="async"
                    className="block h-auto w-full will-change-transform max-sm:h-full max-sm:object-cover max-sm:object-top"
                  />
                </picture>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-4">
        <div className="flex items-center gap-1" role="tablist" aria-label="Screens">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Show ${s.label}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => goTo(i)}
              className="group flex size-6 items-center justify-center"
            >
              <span
                className={`block rounded-full transition-all ${i === index ? "h-2 w-6 bg-foreground" : "size-2 bg-foreground/25 group-hover:bg-foreground/50"}`}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={paused}
          aria-label={paused ? "Play the tour" : "Pause the tour"}
          onClick={() => setPaused((p) => !p)}
          className="flex size-8 items-center justify-center rounded-full border text-muted-foreground hover:bg-muted hover:text-foreground max-sm:hidden"
        >
          {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
        </button>
      </div>
      <p className="mt-2 text-center text-muted-foreground text-sm">
        {SLIDES[index].label}
        <span className="sr-only"> screen of the tour</span>
      </p>
    </section>
  );
}
