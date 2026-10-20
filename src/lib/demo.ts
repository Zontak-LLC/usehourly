import type { Session } from "next-auth";

/**
 * "Try the demo": a visitor gets a real, throwaway account filled with sample data, so every feature
 * works exactly as it does for a member. It is deleted after DEMO_TTL_HOURS unless they turn it into
 * a real account (account.claimDemo). Pure helpers live here; the database work is in server/demo.ts.
 */
export const DEMO_TTL_HOURS = 24;
export const DEMO_EMAIL_DOMAIN = "demo.usehourly.invalid";
/**
 * Most demo accounts alive at once: a ceiling on how much sample data can pile up. They live for DEMO_TTL_HOURS, so
 * this is also how many people can try it in a day: 300 was reached within hours by a busy post, so it is 3,000 (each
 * demo is a few dozen small rows, well inside what D1 holds). Each connection is still limited by DEMO_PER_IP.
 */
export const MAX_LIVE_DEMOS = 3000;
/** New demos per connection per hour. */
export const DEMO_PER_IP = { limit: 5, windowSeconds: 60 * 60 };
/** Not a valid bcrypt hash, so no password ever matches a demo account. */
export const DEMO_PASSWORD_HASH = "!demo-account";

/** `.invalid` is reserved: mail to these addresses can never be delivered, and we never try. */
export const isDemoEmail = (email: string) => email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);

export const isDemoSession = (session: Session | null | undefined) => session?.user?.demo === true;

// ------------------------------------------------------------------------------- sample data

export type DemoData = {
  clients: { key: string; name: string; color: string; legalName: string; address: string }[];
  projects: { key: string; clientKey: string; name: string; hourlyRate: number; billable: boolean }[];
  entries: { projectKey: string; date: string; minutes: number; note: string }[];
  /** Two invoices to show on the Invoices page; the first is marked paid. */
  invoices: {
    clientKey: string;
    from: string;
    to: string;
    issueDate: string;
    dueDate: string;
    paidDate: string | null;
  }[];
};

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utcMs = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);
/** `n` days before an ISO date, done in UTC so it never depends on the server's time zone. */
export const daysBefore = (isoDate: string, n: number) => iso(utcMs(isoDate) - n * DAY);
const isWeekend = (isoDate: string) => [0, 6].includes(new Date(`${isoDate}T00:00:00Z`).getUTCDay());

/** A small deterministic random number generator, so a demo built for a day is the same every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOTES: Record<string, string[]> = {
  website: [
    "Homepage hero and navigation",
    "Pricing page layout, first pass",
    "Fixed the mobile menu on small screens",
    "Contact form and thank-you page",
    "Review with the client, notes for round two",
    "Image optimisation and page speed",
  ],
  support: [
    "Plugin updates and a backup check",
    "Answered the team's questions about the editor",
    "Fixed a broken redirect after the move",
  ],
  app: [
    "Sign-in screen and password reset",
    "Timesheet list and pull to refresh",
    "Push notification set-up",
    "Fixed a crash when the connection drops",
    "Release build and store notes",
  ],
  admin: ["Invoicing and bookkeeping", "Planning next week", "Replying to enquiries"],
};

/**
 * Sample freelance work for the five weeks up to yesterday (UTC, so no entry can ever land in the
 * visitor's future): three clients, four projects, about sixty entries, two invoices.
 */
export function buildDemoData(todayIso: string): DemoData {
  const latest = daysBefore(todayIso, 1);
  const random = rng(utcMs(todayIso) / DAY);
  const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)];

  const clients: DemoData["clients"] = [
    {
      key: "northwind",
      name: "Northwind Studio",
      color: "#6366f1",
      legalName: "Northwind Studio LLC",
      address: "88 Harbor Way\nPortland, OR 97201",
    },
    {
      key: "fable",
      name: "Fable Labs",
      color: "#10b981",
      legalName: "Fable Labs, Inc.",
      address: "410 Mission St\nSan Francisco, CA 94105",
    },
    { key: "own", name: "My own business", color: "#f59e0b", legalName: "", address: "" },
  ];
  const projects: DemoData["projects"] = [
    { key: "website", clientKey: "northwind", name: "Website redesign", hourlyRate: 9500, billable: true },
    { key: "support", clientKey: "northwind", name: "Monthly support", hourlyRate: 7000, billable: true },
    { key: "app", clientKey: "fable", name: "Mobile app", hourlyRate: 11000, billable: true },
    { key: "admin", clientKey: "own", name: "Admin and invoicing", hourlyRate: 0, billable: false },
  ];

  const weights: [string, number][] = [
    ["website", 0.4],
    ["app", 0.35],
    ["support", 0.15],
    ["admin", 0.1],
  ];
  const whichProject = () => {
    const r = random();
    let cumulative = 0;
    for (const [k, w] of weights) {
      cumulative += w;
      if (r < cumulative) return k;
    }
    return "website";
  };
  const lengths = [30, 45, 60, 90, 120, 150, 180, 240];

  const entries: DemoData["entries"] = [];
  const used = new Set<string>();
  const noteCounter: Record<string, number> = {};
  const add = (projectKey: string, date: string, minutes: number) => {
    const n = (noteCounter[projectKey] ?? -1) + 1;
    noteCounter[projectKey] = n;
    const notes = NOTES[projectKey];
    entries.push({ projectKey, date, minutes, note: notes[n % notes.length] });
  };
  for (let back = 0; back < 35; back++) {
    const date = daysBefore(latest, back);
    if (isWeekend(date)) continue;
    // Always work on the first and last weekday of the window and on invoice-period edges, so both invoices have lines.
    const skip = back > 1 && back < 33 && random() < 0.15;
    if (skip) continue;
    const count = random() < 0.5 ? 1 : random() < 0.6 ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const key = whichProject();
      const sig = `${date}|${key}`;
      if (used.has(sig)) continue; // one entry per project per day, like most people log it
      used.add(sig);
      add(key, date, pick(lengths));
    }
  }
  // Guarantee billable time for each client inside each invoice period.
  const ensure = (projectKey: string, from: string, to: string) => {
    const has = entries.some((e) => e.projectKey === projectKey && e.date >= from && e.date <= to);
    if (has) return;
    for (let back = 0; back < 35; back++) {
      const d = daysBefore(latest, back);
      if (d >= from && d <= to && !isWeekend(d) && !used.has(`${d}|${projectKey}`)) {
        used.add(`${d}|${projectKey}`);
        add(projectKey, d, 120);
        return;
      }
    }
  };

  const invoiceA = { from: daysBefore(todayIso, 35), to: daysBefore(todayIso, 15) };
  const invoiceB = { from: daysBefore(todayIso, 14), to: latest };
  ensure("website", invoiceA.from, invoiceA.to);
  ensure("app", invoiceB.from, invoiceB.to);
  entries.sort((a, b) => (a.date === b.date ? a.projectKey.localeCompare(b.projectKey) : a.date.localeCompare(b.date)));

  return {
    clients,
    projects,
    entries,
    invoices: [
      {
        clientKey: "northwind",
        ...invoiceA,
        issueDate: daysBefore(todayIso, 14),
        dueDate: daysBefore(todayIso, -16),
        paidDate: daysBefore(todayIso, 3),
      },
      { clientKey: "fable", ...invoiceB, issueDate: todayIso, dueDate: daysBefore(todayIso, -30), paidDate: null },
    ],
  };
}
