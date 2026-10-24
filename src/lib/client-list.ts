/**
 * Pure rules for the Clients split view (issue 238): the order of the list, the short line under each client's name,
 * the client's usual rate, the bill bar's words and the profile address. Shared by the page and its tests.
 */

import { fromISODate, spanDays } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { count } from "@/lib/plural";
import { splitIdFromPath } from "@/lib/split-path";

/**
 * Clients with time this month first, then the quiet ones (no time this month), each group alphabetical. Before the
 * month's totals arrive every client counts as active, so nothing is pushed down by mistake.
 */
export function orderClients<T extends { id: string; name: string }>(
  clients: readonly T[],
  monthMinutes: (client: T) => number | undefined,
): { client: T; quiet: boolean }[] {
  return clients
    .map((client) => {
      const minutes = monthMinutes(client);
      return { client, quiet: minutes !== undefined && minutes <= 0 };
    })
    .sort((a, b) => Number(a.quiet) - Number(b.quiet) || a.client.name.localeCompare(b.client.name));
}

/**
 * The list in two groups: "To bill" (clients with billable time not on an invoice yet, the most money first, then by
 * name) and "All billed up" (time this month first, then the quiet ones, each alphabetical).
 */
export function groupClientList<T extends { id: string; name: string }>(
  clients: readonly T[],
  unbilledCents: (client: T) => number,
  monthMinutes: (client: T) => number | undefined,
): { toBill: T[]; billed: { client: T; quiet: boolean }[] } {
  const toBill = clients
    .filter((c) => unbilledCents(c) > 0)
    .sort((a, b) => unbilledCents(b) - unbilledCents(a) || a.name.localeCompare(b.name));
  const billed = orderClients(
    clients.filter((c) => unbilledCents(c) <= 0),
    monthMinutes,
  );
  return { toBill, billed };
}

/** The client a wide screen shows when the address names none: the top of the list. */
export function defaultClientId(groups: { toBill: { id: string }[]; billed: { client: { id: string } }[] }) {
  return groups.toBill[0]?.id ?? groups.billed[0]?.client.id ?? null;
}

/**
 * The line under a client's name in the list: "4:15 this month", or how long it has been quiet ("quiet for 3 weeks"),
 * or "No time yet". `last` is the newest day with time for the client; `today` is the browser's date (null before load).
 */
export function clientListLine(monthMinutes: number, last: string | null, today: string | null): string {
  if (monthMinutes > 0) return `${formatDuration(monthMinutes)} this month`;
  if (!last) return "No time yet";
  const days = today ? spanDays(last, today) - 1 : 0;
  if (days < 1) return "No time this month";
  if (days < 14) return `quiet for ${count(days, "day")}`;
  return `quiet for ${count(Math.floor(days / 7), "week")}`;
}

/**
 * "usually $95/h": the rate that carries the most of the client's time (billable projects with a rate only; a tie goes
 * to the higher rate; with no time yet, the most common rate). Null when no project has a rate.
 */
export function usualRate(
  projects: readonly { id: string; hourly_rate: number; billable: boolean }[],
  allTimeMinutes: (projectId: string) => number,
): number | null {
  const weight = new Map<number, { minutes: number; projects: number }>();
  for (const p of projects) {
    if (!p.billable || p.hourly_rate <= 0) continue;
    const w = weight.get(p.hourly_rate) ?? { minutes: 0, projects: 0 };
    w.minutes += allTimeMinutes(p.id);
    w.projects += 1;
    weight.set(p.hourly_rate, w);
  }
  let best: number | null = null;
  let bestW = { minutes: -1, projects: 0 };
  for (const [rate, w] of weight) {
    const better =
      w.minutes > bestW.minutes ||
      (w.minutes === bestW.minutes &&
        (w.projects > bestW.projects || (w.projects === bestW.projects && rate > (best ?? 0))));
    if (better) {
      best = rate;
      bestW = w;
    }
  }
  return best;
}

/** "Oct 9", with the year when it is not this year (or when today is not known yet). */
export function shortDay(date: string, today: string | null, locale?: string): string {
  const sameYear = today !== null && date.slice(0, 4) === today.slice(0, 4);
  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return new Intl.DateTimeFormat(locale, opts).format(fromISODate(date));
}

/**
 * The bill bar's second line: "11:30 h from Oct 9 to Oct 22 · oldest day 14 days ago" (one day: "2:00 h on Oct 9").
 * The age of the oldest day is left out until the browser's date is known.
 */
export function billBarDetail(
  u: { minutes: number; from: string; to: string },
  today: string | null,
  locale?: string,
): string {
  const hours = `${formatDuration(u.minutes)} h`;
  const span =
    u.from === u.to
      ? `${hours} on ${shortDay(u.from, today, locale)}`
      : `${hours} from ${shortDay(u.from, today, locale)} to ${shortDay(u.to, today, locale)}`;
  if (!today) return span;
  const days = spanDays(u.from, today) - 1;
  const age = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return `${span} · oldest day ${age}`;
}

/** The address of one client's profile, and the client an address names (null for the list or the archived page). */
export const clientPath = (id: string) => `/dashboard/clients/${encodeURIComponent(id)}`;

export const clientIdFromPath = (pathname: string) => splitIdFromPath(pathname, "/dashboard/clients", ["archived"]);
