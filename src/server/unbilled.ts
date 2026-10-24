import type { PrismaClient } from "@prisma/client";

import { amountCents } from "@/lib/invoice";
import type { Unbilled } from "@/lib/unbilled";

import { nonBillableDates } from "./non-billable";

/** D1 allows 100 bound values per query; ids go in groups well under that. */
const CHUNK = 80;

/**
 * Marks unbilled entries as billed on `invoiceId`. An entry already on an invoice (billed again on purpose, or taken by
 * another invoice made at the same moment) keeps its first invoice; the answer says how many were marked, so the caller
 * can tell a clash.
 */
export async function markInvoiced(
  prisma: PrismaClient,
  userId: string,
  invoiceId: string,
  ids: string[],
): Promise<number> {
  let marked = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { count } = await prisma.timeEntry.updateMany({
      where: { user_id: userId, id: { in: ids.slice(i, i + CHUNK) }, invoice_id: null },
      data: { invoice_id: invoiceId },
    });
    marked += count;
  }
  return marked;
}

/**
 * Per client: the billable time not invoiced yet (running timers left out). One grouped read over the entries plus the
 * account's projects; the account filter on both is the isolation boundary.
 */
export async function unbilledByClient(prisma: PrismaClient, userId: string): Promise<Unbilled[]> {
  // Three independent reads started together (one round trip); the grouped sum is served by the partial index on
  // unbilled time (migration 0038), so it reads what is waiting to be billed, not the account's whole history.
  const [groups, projects, offDays] = await Promise.all([
    prisma.timeEntry.groupBy({
      by: ["project_id"],
      where: { user_id: userId, invoice_id: null, started_at: null, minutes: { gt: 0 } },
      _sum: { minutes: true },
      _min: { date: true },
      _max: { date: true },
    }),
    prisma.project.findMany({
      where: { user_id: userId },
      select: { id: true, client_id: true, billable: true, hourly_rate: true },
    }),
    // Time on days marked non-billable is never invoiced, so it is not waiting to be billed either.
    nonBillableDates(prisma, userId),
  ]);
  const offMinutes = new Map<string, number>();
  const days = [...offDays];
  for (let i = 0; i < days.length; i += CHUNK) {
    const rows = await prisma.timeEntry.findMany({
      where: {
        user_id: userId,
        invoice_id: null,
        started_at: null,
        minutes: { gt: 0 },
        date: { in: days.slice(i, i + CHUNK) },
      },
      select: { project_id: true, minutes: true },
    });
    for (const r of rows) offMinutes.set(r.project_id, (offMinutes.get(r.project_id) ?? 0) + r.minutes);
  }
  const byId = new Map(projects.map((p) => [p.id, p]));
  const out = new Map<string, Unbilled>();
  for (const g of groups) {
    const p = byId.get(g.project_id);
    const minutes = (g._sum.minutes ?? 0) - (offMinutes.get(g.project_id) ?? 0);
    if (!p?.billable || minutes <= 0 || !g._min.date || !g._max.date) continue;
    const row = out.get(p.client_id) ?? {
      clientId: p.client_id,
      minutes: 0,
      cents: 0,
      from: g._min.date,
      to: g._max.date,
    };
    row.minutes += minutes;
    row.cents += amountCents(minutes, p.hourly_rate);
    if (g._min.date < row.from) row.from = g._min.date;
    if (g._max.date > row.to) row.to = g._max.date;
    out.set(p.client_id, row);
  }
  return [...out.values()];
}
