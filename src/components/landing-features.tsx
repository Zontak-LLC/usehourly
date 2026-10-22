import {
  CalendarDays,
  Coins,
  FileSpreadsheet,
  FileText,
  Gauge,
  HardDrive,
  type LucideIcon,
  ShieldCheck,
  Signature,
  SunMoon,
  Timer,
  Users,
  WifiOff,
} from "lucide-react";

import { Reveal } from "@/components/reveal";

const FEATURES: { Icon: LucideIcon; title: string; body: string; color: string }[] = [
  {
    Icon: Timer,
    title: "Quick entry and a timer",
    body: "Type 1h30 and press Enter, or start a timer. A forgotten timer never banks more than a day.",
    color: "#F5A524",
  },
  {
    Icon: FileText,
    title: "Invoices you can send",
    body: "A PDF, an email from the app, or a private link. Mark them paid, and turn on reminders for late ones.",
    color: "#3DDC97",
  },
  {
    Icon: Signature,
    title: "Timesheets clients approve",
    body: "Share a frozen timesheet. Your client reads it and approves with their name, and you get an email.",
    color: "#8A6CFF",
  },
  {
    Icon: Users,
    title: "Your team",
    body: "Invite someone to log time on only the clients you choose. Their hours land on your books, with their name.",
    color: "#ff7a45",
  },
  {
    Icon: Gauge,
    title: "Project budgets",
    body: "Set hours or money per project. A bar turns yellow at 80% and red when you pass it.",
    color: "#F5A524",
  },
  {
    Icon: CalendarDays,
    title: "Meetings become entries",
    body: "Bring in a calendar file, a private address or Google Calendar. One tap adds a meeting as time.",
    color: "#3DDC97",
  },
  {
    Icon: Coins,
    title: "Any currency, fair rounding",
    body: "Bill each client in its own currency and round time up to 6, 15 or 30 minutes, entry by entry.",
    color: "#8A6CFF",
  },
  {
    Icon: FileSpreadsheet,
    title: "Tax time without the scramble",
    body: "A year summary by quarter, month and client, an Excel export, and files for Xero and QuickBooks.",
    color: "#ff7a45",
  },
  {
    Icon: WifiOff,
    title: "Works offline, installs like an app",
    body: "Add it to your home screen. Entries typed with no connection are kept and sent once, when it returns.",
    color: "#F5A524",
  },
  {
    Icon: HardDrive,
    title: "Your data is yours",
    body: "Export everything as spreadsheets any time, bring your history in from Toggl or Clockify, or delete it all.",
    color: "#3DDC97",
  },
  {
    Icon: SunMoon,
    title: "Light and dark",
    body: "Pick the look that suits your eyes. One clean design, easy to read at any hour, on a phone or a desktop.",
    color: "#F5A524",
  },
  {
    Icon: ShieldCheck,
    title: "Private by design",
    body: "Your account is yours alone. Page counts are anonymous, and there are no ads or trackers.",
    color: "#8A6CFF",
  },
];

/** What the app does today, as a grid of short tiles with an accent colour each. */
export function LandingFeatures() {
  return (
    <ul className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map(({ Icon, title, body, color }, n) => (
        <Reveal
          as="li"
          delay={(n % 3) * 90}
          key={title}
          className="relative overflow-hidden rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10"
        >
          <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} />
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-2xl"
            style={{ backgroundColor: `${color}26`, color }}
          >
            <Icon className="size-5" />
          </span>
          <p className="mt-3 font-bold font-display text-xl leading-snug">{title}</p>
          <p className="mt-1 text-muted-foreground">{body}</p>
        </Reveal>
      ))}
    </ul>
  );
}
