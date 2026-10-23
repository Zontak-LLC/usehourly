import type { ReactNode } from "react";

import { HardDrive, type LucideIcon, ShieldCheck, SunMoon, WifiOff } from "lucide-react";

import { ClientsArt, InvoiceArt, MonthArt, QuickEntryArt, WeekArt, YearArt } from "@/components/landing-feature-art";
import { Reveal } from "@/components/reveal";

type Tile = { title: string; body: string; art: ReactNode; wide?: boolean; full?: boolean };

/** What the first release does, each with a small picture of itself (hidden features are not advertised). */
const TILES: Tile[] = [
  {
    title: "Quick entry, no stopwatch needed",
    body: "Type 1h30 and press Enter, or tap 2h twice for four hours. A timer is there if you like one.",
    art: <QuickEntryArt />,
    wide: true,
  },
  {
    title: "Invoices from your hours",
    body: "A clean PDF or a private link your client opens. See what is paid, what is waiting and what is late.",
    art: <InvoiceArt />,
    wide: true,
  },
  {
    title: "Your week, gaps and all",
    body: "Seven days in one row. A weekday with nothing logged shows up, so nothing slips through.",
    art: <WeekArt />,
  },
  {
    title: "A month you can rearrange",
    body: "Every day's hours at a glance. Logged it on the wrong day? Drag it onto the right one.",
    art: <MonthArt />,
  },
  {
    title: "Clients and what they owe",
    body: "Each client's month in hours and money, and one tap to make the invoice.",
    art: <ClientsArt />,
  },
  {
    title: "Tax time without the scramble",
    body: "A year summary by quarter, month and client, ready for your accountant, and an Excel export.",
    art: <YearArt />,
    full: true,
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
    body: "Export everything in files any tool can open, or delete it all.",
  },
  { Icon: SunMoon, title: "Light and dark", body: "Easy to read at any hour, on a phone or a desktop." },
  { Icon: ShieldCheck, title: "Private by design", body: "No ads, no trackers. Page counts are anonymous." },
];

/** What the app does today: a bento of picture tiles, then a slim row of the quieter promises. */
export function LandingFeatures() {
  return (
    <div className="mx-auto mt-10 max-w-5xl">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {TILES.map(({ title, body, art, wide, full }, n) => (
          <Reveal
            as="li"
            delay={(n % 3) * 90}
            key={title}
            className={`group flex flex-col gap-4 rounded-3xl bg-card p-4 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 transition-transform duration-300 hover:-translate-y-1 ${full ? "sm:col-span-2 lg:col-span-6" : wide ? "lg:col-span-3" : "lg:col-span-2"}`}
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
