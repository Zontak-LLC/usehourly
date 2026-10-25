import { USAGE_PAGE_LABELS, USAGE_PAGES, type UsagePage } from "./usage";

/**
 * Turns rows the router collected into the numbers on the Insights page. Pure, so the rules are tested
 * without a database. Everything is an aggregate: no email, name, client or entry text appears here.
 * Sample (demo) accounts are left out of every figure except their own count.
 */
export type InsightsInput = {
  now: Date;
  /** Real (non-sample) accounts only. */
  users: { id: string; created_at: Date }[];
  demoCount: number;
  /** All time, the accounts with at least one entry and when the first one was made. */
  entryStats: { user_id: string; first: Date }[];
  /** Accounts that created or changed an entry in the last 7 and 30 days. */
  active7: string[];
  active30: string[];
  /** Entries created in the last 30 days, per account. */
  entries30: { user_id: string; count: number }[];
  invoiceUserIds: string[];
  usage: { day: string; page: string; count: number }[];
};

export type Insights = {
  totals: { users: number; demoAccounts: number };
  signups: { last7: number; last30: number; byWeek: { week: string; count: number }[] };
  funnel: { signedUp: number; withEntry: number; withInvoice: number; firstEntryWithinDay: number };
  active: { last7: number; last30: number; retention: { eligible: number; active: number } };
  entriesPerActiveUser30: number | null;
  pages: { page: UsagePage; label: string; views30: number }[];
  daily: { day: string; views: number }[];
};

const DAY = 86_400_000;
const WEEKS = 12;
const DAILY_DAYS = 14;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** The Monday (UTC) of the week a date falls in, as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const back = (copy.getUTCDay() + 6) % 7; // Monday = 0
  return dayKey(new Date(copy.getTime() - back * DAY));
}

export function buildInsights(input: InsightsInput): Insights {
  const { now, users } = input;
  const real = new Set(users.map((u) => u.id));
  const ms = now.getTime();

  // Sign-ups, bucketed by week (oldest first, empty weeks shown as zero).
  const thisWeek = new Date(`${weekStart(now)}T00:00:00Z`).getTime();
  const weeks = Array.from({ length: WEEKS }, (_, i) => dayKey(new Date(thisWeek - (WEEKS - 1 - i) * 7 * DAY)));
  const byWeek = new Map(weeks.map((w) => [w, 0]));
  for (const u of users) {
    const w = weekStart(u.created_at);
    if (byWeek.has(w)) byWeek.set(w, (byWeek.get(w) ?? 0) + 1);
  }

  // Activation: did people get as far as a first entry and a first invoice?
  const stats = new Map(input.entryStats.filter((s) => real.has(s.user_id)).map((s) => [s.user_id, s]));
  const withEntry = users.filter((u) => stats.has(u.id)).length;
  const invoiced = new Set(input.invoiceUserIds.filter((id) => real.has(id)));
  const firstEntryWithinDay = users.filter((u) => {
    const first = stats.get(u.id)?.first;
    return first !== undefined && first.getTime() - u.created_at.getTime() <= DAY;
  }).length;

  const active7 = new Set(input.active7.filter((id) => real.has(id)));
  const active30 = new Set(input.active30.filter((id) => real.has(id)));

  // Retention: of everyone who signed up at least four weeks ago, how many touched an entry this week.
  const eligible = users.filter((u) => ms - u.created_at.getTime() >= 28 * DAY);
  const retained = eligible.filter((u) => active7.has(u.id)).length;

  const entries30 = input.entries30.filter((e) => real.has(e.user_id)).reduce((sum, e) => sum + e.count, 0);

  // Page views: the last 30 days per page, and a zero-filled daily total for the last two weeks.
  const since30 = dayKey(new Date(ms - 29 * DAY));
  const perPage = new Map<UsagePage, number>(USAGE_PAGES.map((p) => [p, 0]));
  const perDay = new Map<string, number>();
  for (let i = DAILY_DAYS - 1; i >= 0; i--) perDay.set(dayKey(new Date(ms - i * DAY)), 0);
  for (const row of input.usage) {
    if (row.day >= since30 && perPage.has(row.page as UsagePage)) {
      perPage.set(row.page as UsagePage, (perPage.get(row.page as UsagePage) ?? 0) + row.count);
    }
    if (perDay.has(row.day)) perDay.set(row.day, (perDay.get(row.day) ?? 0) + row.count);
  }

  return {
    totals: { users: users.length, demoAccounts: input.demoCount },
    signups: {
      last7: users.filter((u) => ms - u.created_at.getTime() < 7 * DAY).length,
      last30: users.filter((u) => ms - u.created_at.getTime() < 30 * DAY).length,
      byWeek: weeks.map((week) => ({ week, count: byWeek.get(week) ?? 0 })),
    },
    funnel: {
      signedUp: users.length,
      withEntry,
      withInvoice: users.filter((u) => invoiced.has(u.id)).length,
      firstEntryWithinDay,
    },
    active: { last7: active7.size, last30: active30.size, retention: { eligible: eligible.length, active: retained } },
    entriesPerActiveUser30: active30.size > 0 ? Math.round((entries30 / active30.size) * 10) / 10 : null,
    pages: USAGE_PAGES.map((page) => ({ page, label: USAGE_PAGE_LABELS[page], views30: perPage.get(page) ?? 0 })).sort(
      (a, b) => b.views30 - a.views30,
    ),
    daily: [...perDay].map(([day, views]) => ({ day, views })),
  };
}
