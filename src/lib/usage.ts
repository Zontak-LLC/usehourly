/**
 * Which in-app pages are counted. The list is closed on purpose: the counter table can only ever hold
 * days x these pages, and nothing a visitor sends can add a new row.
 */
export const USAGE_PAGES = [
  "today",
  "week",
  "month",
  "report",
  "invoices",
  "new-invoice",
  "clients",
  "account",
] as const;
export type UsagePage = (typeof USAGE_PAGES)[number];

export const USAGE_PAGE_LABELS: Record<UsagePage, string> = {
  today: "Today",
  week: "Week",
  month: "Month",
  report: "Year summary",
  invoices: "Invoices",
  "new-invoice": "New invoice",
  clients: "My work",
  account: "Account",
};

const BY_PATH: Record<string, UsagePage> = {
  "/dashboard/today": "today",
  "/dashboard/week": "week",
  "/dashboard/month": "month",
  "/dashboard/report": "report",
  "/dashboard/invoices": "invoices",
  "/dashboard/invoices/new": "new-invoice",
  "/dashboard/clients": "clients",
  "/dashboard/account": "account",
};

/** The page a browser path counts as, or null for pages we do not count (admin pages, anything unknown). */
export function usagePageForPath(pathname: string): UsagePage | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return BY_PATH[clean] ?? null;
}

export const isUsagePage = (value: unknown): value is UsagePage =>
  typeof value === "string" && (USAGE_PAGES as readonly string[]).includes(value);

/** The UTC calendar day a view is filed under (YYYY-MM-DD). */
export const usageDay = (now: Date = new Date()): string => now.toISOString().slice(0, 10);
