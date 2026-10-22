import type { ReactNode } from "react";

import { HardDrive, type LucideIcon, ShieldCheck, SunMoon, WifiOff } from "lucide-react";

import {
  ApprovalArt,
  BudgetArt,
  CalendarArt,
  CurrencyArt,
  InvoiceArt,
  QuickEntryArt,
  TeamArt,
  YearArt,
} from "@/components/landing-feature-art";
import { Reveal } from "@/components/reveal";

type Tile = { title: string; body: string; art: ReactNode; wide?: boolean };

/** The eight things people ask about most, each with a small picture of itself. */
const TILES: Tile[] = [
  {
    title: "Quick entry and a timer",
    body: "Type 1h30 and press Enter, or start a timer. A forgotten timer never banks more than a day.",
    art: <QuickEntryArt />,
    wide: true,
  },
  {
    title: "Invoices you can send",
    body: "A PDF, an email from the app, or a private link. Mark them paid, and turn on reminders for late ones.",
    art: <InvoiceArt />,
    wide: true,
  },
  {
    title: "Timesheets clients approve",
    body: "Share a frozen timesheet. Your client reads it and approves with their name, and you get an email.",
    art: <ApprovalArt />,
  },
  {
    title: "Project budgets",
    body: "Set hours or money per project. A bar turns yellow at 80% and red when you pass it.",
    art: <BudgetArt />,
  },
  {
    title: "Meetings become entries",
    body: "Bring in a calendar file, a private address or Google Calendar. One tap adds a meeting as time.",
    art: <CalendarArt />,
  },
  {
    title: "Your team",
    body: "Invite someone to log time on only the clients you choose. Their hours land on your books, with their name.",
    art: <TeamArt />,
  },
  {
    title: "Any currency, fair rounding",
    body: "Bill each client in its own currency and round time up to 6, 15 or 30 minutes, entry by entry.",
    art: <CurrencyArt />,
  },
  {
    title: "Tax time without the scramble",
    body: "A year summary by quarter, month and client, an Excel export, and files for Xero and QuickBooks.",
    art: <YearArt />,
  },
];

const EXTRAS: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: WifiOff,
    title: "Works offline",
    body: "Install it on your home screen. Entries typed with no connection are sent once it returns.",
  },
  {
    Icon: HardDrive,
    title: "Your data is yours",
    body: "Export everything, import from Toggl or Clockify, or delete it all.",
  },
  { Icon: SunMoon, title: "Light and dark", body: "Easy to read at any hour, on a phone or a desktop." },
  { Icon: ShieldCheck, title: "Private by design", body: "No ads, no trackers. Page counts are anonymous." },
];

/** What the app does today: a bento of picture tiles, then a slim row of the quieter promises. */
export function LandingFeatures() {
  return (
    <div className="mx-auto mt-10 max-w-5xl">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {TILES.map(({ title, body, art, wide }, n) => (
          <Reveal
            as="li"
            delay={(n % 3) * 90}
            key={title}
            className={`group flex flex-col gap-4 rounded-3xl bg-card p-4 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 transition-transform duration-300 hover:-translate-y-1 ${wide ? "lg:col-span-3" : "lg:col-span-2"}`}
          >
            {art}
            <div className="px-1 pb-1">
              <p className="font-bold font-display text-xl leading-snug">{title}</p>
              <p className="mt-1 text-muted-foreground">{body}</p>
            </div>
          </Reveal>
        ))}
      </ul>
      <ul className="mt-4 grid gap-x-6 gap-y-5 rounded-3xl bg-muted/50 p-6 sm:grid-cols-2 lg:grid-cols-4">
        {EXTRAS.map(({ Icon, title, body }) => (
          <li key={title} className="flex gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-muted-foreground text-sm">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
