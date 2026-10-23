/**
 * The global search in the top bar. Pure rules only: what a typed word matches, which pages and settings exist, and how
 * results are grouped and ordered. The component fetches clients, entries and invoices and feeds them in here.
 */
import { type Feature, feature } from "@/lib/features";

export type SearchGroup = "Pages" | "Settings" | "Clients and projects" | "Time entries" | "Invoices";

export type SearchResult = {
  /** Unique, stable: used as the list key and for the keyboard cursor. */
  id: string;
  group: SearchGroup;
  title: string;
  /** A short second line (the client of a project, the hours of an entry...). */
  detail?: string;
  /** Where choosing it goes. A `#anchor` scrolls to that part of the page. */
  href: string;
};

export const GROUP_ORDER: readonly SearchGroup[] = [
  "Pages",
  "Settings",
  "Clients and projects",
  "Time entries",
  "Invoices",
];

const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** True when every typed word is the start of some word in `text`. ("pass" finds "Change password".) */
export function matchesAll(query: string, text: string): boolean {
  const typed = words(query);
  if (typed.length === 0) return false;
  const have = words(text);
  return typed.every((t) => have.some((w) => w.startsWith(t)));
}

/** `feature` names the switch in lib/features.ts that must be on for the target to be found. */
type Target = { title: string; href: string; keywords?: string; detail?: string; feature?: Feature };

/** Leaves out what points at a hidden feature, so search never offers something the app does not show. */
const shown = (targets: Target[]) => targets.filter((t) => !t.feature || feature(t.feature));

const PAGES: Target[] = shown([
  { title: "Today", href: "/dashboard/today", keywords: "log time add timer day" },
  { title: "Week", href: "/dashboard/week", keywords: "weekly timesheet days" },
  { title: "Month", href: "/dashboard/month", keywords: "calendar monthly" },
  { title: "Invoices", href: "/dashboard/invoices", keywords: "invoice paid unpaid history" },
  { title: "New invoice", href: "/dashboard/invoices/new", keywords: "create make invoice bill" },
  { title: "Clients", href: "/dashboard/clients", keywords: "projects rates client project" },
  { title: "Team", href: "/dashboard/team", keywords: "invite people members", feature: "team" },
  { title: "Year summary", href: "/dashboard/report", keywords: "report taxes annual accountant" },
  { title: "Account", href: "/dashboard/account", keywords: "settings profile" },
  { title: "Guide and FAQ", href: "/help", keywords: "help how to questions support" },
]);

const SETTINGS: Target[] = shown([
  {
    title: feature("avatar") ? "Profile: name, email, picture" : "Profile: name and email",
    href: "/dashboard/account#account",
    keywords: "account your",
  },
  { title: "Change password", href: "/dashboard/account#account", keywords: "sign in security" },
  {
    title: "Friday reminder email",
    href: "/dashboard/account#account",
    keywords: "weekly notification",
    feature: "weeklyReminder",
  },
  { title: "Log out", href: "/dashboard/account#account", keywords: "sign out" },
  { title: "Business details and logo", href: "/dashboard/account#invoices", keywords: "ein address invoice" },
  { title: "Currency", href: "/dashboard/account#invoices", keywords: "euro dollar pound money" },
  { title: "Export everything", href: "/dashboard/account#data", keywords: "download zip csv excel backup" },
  {
    title: "Send invoices to Xero or QuickBooks",
    href: "/dashboard/account#data",
    keywords: "accounting books",
    feature: "accountingExport",
  },
  {
    title: "Import from Toggl or Clockify",
    href: "/dashboard/account#data",
    keywords: "csv history",
    feature: "importTime",
  },
  { title: "Keep a copy on this device", href: "/dashboard/account#data", keywords: "offline", feature: "localFirst" },
  { title: "Delete account", href: "/dashboard/account#account", keywords: "remove erase privacy" },
  {
    title: "Connect an AI assistant",
    href: "/dashboard/account#ai",
    keywords: "claude chatgpt cursor mcp server integration",
  },
  {
    title: "API tokens",
    href: "/dashboard/account#ai",
    keywords: "api key keys token tokens access authentication auth bearer credentials secret personal developer",
  },
  {
    title: "Polish descriptions with your own AI key",
    href: "/dashboard/account#ai",
    keywords: "openai anthropic",
    feature: "aiPolish",
  },
]);

const find = (group: SearchGroup, targets: Target[], query: string, max: number): SearchResult[] =>
  targets
    .filter((t) => matchesAll(query, `${t.title} ${t.keywords ?? ""}`))
    .slice(0, max)
    .map((t) => ({ id: `${group}:${t.title}`, group, title: t.title, detail: t.detail, href: t.href }));

/** Every page as a result: what the box shows before anything is typed. */
export function allPages(): SearchResult[] {
  return PAGES.map((t) => ({ id: `Pages:${t.title}`, group: "Pages", title: t.title, href: t.href }));
}

/** Pages and settings that match, from fixed lists (no network). */
export function matchPagesAndSettings(query: string): SearchResult[] {
  return [...find("Pages", PAGES, query, 4), ...find("Settings", SETTINGS, query, 5)];
}

/** The account's clients and projects that match by name. */
export function matchClientsAndProjects(
  query: string,
  clients: readonly { id: string; name: string; projects: readonly { id: string; name: string }[] }[],
  max = 6,
): SearchResult[] {
  const out: SearchResult[] = [];
  for (const c of clients) {
    if (matchesAll(query, c.name)) {
      out.push({
        id: `client:${c.id}`,
        group: "Clients and projects",
        title: c.name,
        detail: `${c.projects.length} project${c.projects.length === 1 ? "" : "s"}`,
        href: "/dashboard/clients",
      });
    }
    for (const p of c.projects) {
      if (matchesAll(query, p.name)) {
        out.push({
          id: `project:${p.id}`,
          group: "Clients and projects",
          title: p.name,
          detail: c.name,
          href: "/dashboard/clients",
        });
      }
    }
  }
  return out.slice(0, max);
}

/** Entries found by the server, shown with where choosing one goes: that day on Today. */
export function entryResults(
  entries: readonly { id: string; date: string; minutes: number; note: string; project: string; client: string }[],
  hoursText: (minutes: number) => string,
): SearchResult[] {
  return entries.map((e) => ({
    id: `entry:${e.id}`,
    group: "Time entries",
    title: e.note || "(no description)",
    detail: `${e.date} · ${hoursText(e.minutes)} · ${e.project}, ${e.client}`,
    href: `/dashboard/today?date=${e.date}`,
  }));
}

/** Invoices found by the server: the number and client; choosing one opens the Invoices page. */
export function invoiceResults(invoices: readonly { id: string; number: string; client_name: string }[], max = 4) {
  return invoices.slice(0, max).map(
    (i): SearchResult => ({
      id: `invoice:${i.id}`,
      group: "Invoices",
      title: i.number,
      detail: i.client_name,
      href: "/dashboard/invoices",
    }),
  );
}

/** Puts results in the fixed group order (stable inside a group) and returns them with their group headings. */
export function groupResults(results: readonly SearchResult[]): { group: SearchGroup; items: SearchResult[] }[] {
  return GROUP_ORDER.map((group) => ({ group, items: results.filter((r) => r.group === group) })).filter(
    (g) => g.items.length > 0,
  );
}
