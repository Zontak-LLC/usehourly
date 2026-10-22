"use client";

import { useState } from "react";

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

/** The real app in a window: six tabs, each a picture of the screen (light or dark to match the page) with a line on what it is for. */
export function LandingShowcase() {
  const [on, setOn] = useState<(typeof SCREENS)[number]["id"]>("today");
  const screen = SCREENS.find((s) => s.id === on) ?? SCREENS[0];
  return (
    <div className="mx-auto max-w-5xl">
      <div
        role="tablist"
        aria-label="Screens of the app"
        className="mx-auto flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none] sm:flex-wrap sm:justify-center [&::-webkit-scrollbar]:hidden"
      >
        {SCREENS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`shot-tab-${s.id}`}
            aria-selected={s.id === on}
            aria-controls="shot-panel"
            onClick={() => setOn(s.id)}
            className={`min-h-10 shrink-0 whitespace-nowrap rounded-full px-4 font-semibold text-sm transition-colors ${
              s.id === on ? "bg-amber text-[#1b1405]" : "text-foreground/75 hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div id="shot-panel" role="tabpanel" aria-labelledby={`shot-tab-${screen.id}`} className="mt-6">
        <p className="text-center">
          <span className="font-bold font-display text-xl">{screen.title}</span>
          <span className="mx-auto mt-1 block max-w-xl text-muted-foreground">{screen.text}</span>
        </p>
        <div className="mt-5 overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10">
          <div aria-hidden className="flex items-center gap-1.5 border-foreground/10 border-b bg-muted/60 px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-foreground/20" />
            <span className="size-2.5 rounded-full bg-foreground/20" />
            <span className="size-2.5 rounded-full bg-foreground/20" />
            <span className="ml-3 rounded-md bg-card px-3 py-0.5 font-mono text-[11px] text-foreground/70">
              usehourly.app
            </span>
          </div>
          {/* the light picture on a light page, the dark one on a dark page */}
          {/* A phone gets the phone picture in light mode; the dark picture is the same for every size. */}
          <picture className="dark:hidden">
            <source media="(max-width: 639px)" srcSet={`/landing/tour-phone/${screen.file}.webp`} />
            {/* biome-ignore lint/performance/noImgElement: a fixed local picture, sized by its own width and height */}
            <img
              src={`/landing/tour/${screen.file}.webp`}
              alt={`The ${screen.label} screen of UseHourly: ${screen.title.toLowerCase()}`}
              width={1440}
              height={1240}
              loading="lazy"
              decoding="async"
              className="h-auto w-full"
            />
          </picture>
          {/* biome-ignore lint/performance/noImgElement: a fixed local picture, sized by its own width and height */}
          <img
            src={`/landing/tour-dark/${screen.file}.webp`}
            alt=""
            width={1000}
            height={862}
            loading="lazy"
            decoding="async"
            className="hidden h-auto w-full dark:block"
          />
        </div>
      </div>
    </div>
  );
}
