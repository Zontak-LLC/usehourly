import type { PrismaClient } from "@prisma/client";

import { amountCents } from "@/lib/invoice";
import { duePeriod, periodInvoiced, type SchedulePeriod, scheduleOf } from "@/lib/invoice-schedule";
import type { DueInvoice, Unbilled } from "@/lib/unbilled";

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

type ProjectRow = { id: string; client_id: string; billable: boolean; hourly_rate: number };

/**
 * For clients on an invoice schedule: the unbilled time inside the latest period that is over (issue 100), unless an
 * invoice for the client already covers that whole period. `offDays` are the account's non-billable days.
 */
async function dueInvoices(
  prisma: PrismaClient,
  userId: string,
  periods: Map<string, SchedulePeriod>,
  projects: ProjectRow[],
  offDays: Set<string>,
): Promise<Map<string, DueInvoice>> {
  const out = new Map<string, DueInvoice>();
  const ids = [...periods.keys()];
  if (ids.length === 0) return out;
  const all = [...periods.values()];
  const from = all.reduce((a, p) => (p.from < a ? p.from : a), all[0].from);
  const to = all.reduce((a, p) => (p.to > a ? p.to : a), all[0].to);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const minutesByProject = new Map<string, Map<string, number>>(); // client -> project -> minutes
  const covered = new Set<string>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const group = ids.slice(i, i + CHUNK);
    const [rows, invoices] = await Promise.all([
      prisma.timeEntry.findMany({
        where: {
          user_id: userId,
          invoice_id: null,
          started_at: null,
          minutes: { gt: 0 },
          date: { gte: from, lte: to },
          project: { client_id: { in: group } },
        },
        select: { project_id: true, date: true, minutes: true },
      }),
      prisma.invoice.findMany({
        where: { user_id: userId, client_id: { in: group }, period_to: { gte: from } },
        select: { client_id: true, period_from: true, period_to: true },
      }),
    ]);
    for (const id of group) {
      const p = periods.get(id) as SchedulePeriod;
      if (
        periodInvoiced(
          p,
          invoices.filter((inv) => inv.client_id === id),
        )
      )
        covered.add(id);
    }
    for (const r of rows) {
      const project = byId.get(r.project_id);
      const p = project && periods.get(project.client_id);
      if (!project?.billable || !p || r.date < p.from || r.date > p.to || offDays.has(r.date)) continue;
      const perProject = minutesByProject.get(project.client_id) ?? new Map<string, number>();
      perProject.set(project.id, (perProject.get(project.id) ?? 0) + r.minutes);
      minutesByProject.set(project.client_id, perProject);
    }
  }
  for (const [clientId, perProject] of minutesByProject) {
    if (covered.has(clientId)) continue;
    const p = periods.get(clientId) as SchedulePeriod;
    let minutes = 0;
    let cents = 0;
    for (const [projectId, m] of perProject) {
      minutes += m;
      cents += amountCents(m, byId.get(projectId)?.hourly_rate ?? 0);
    }
    if (minutes > 0) out.set(clientId, { from: p.from, to: p.to, minutes, cents });
  }
  return out;
}

/**
 * Per client: the billable time not invoiced yet (running timers left out). One grouped read over the entries plus the
 * account's projects; the account filter on both is the isolation boundary. With the browser's `today`, each row also
 * says whether an invoice is due under the client's schedule (`due`).
 */
export async function unbilledByClient(prisma: PrismaClient, userId: string, today?: string): Promise<Unbilled[]> {
  // Independent reads started together (one round trip); the grouped sum is served by the partial index on
  // unbilled time (migration 0038), so it reads what is waiting to be billed, not the account's whole history.
  const [groups, projects, offDays, scheduled] = await Promise.all([
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
    today
      ? prisma.client.findMany({
          where: { user_id: userId, archived: false, invoice_every: { not: null } },
          select: { id: true, invoice_every: true, invoice_anchor: true },
        })
      : Promise.resolve([]),
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
  if (today) {
    // Only clients with unbilled time at all can have an invoice due.
    const periods = new Map<string, SchedulePeriod>();
    for (const c of scheduled) {
      const s = scheduleOf(c);
      const p = s && out.has(c.id) ? duePeriod(s, today) : null;
      if (p) periods.set(c.id, p);
    }
    const due = await dueInvoices(prisma, userId, periods, projects, offDays);
    for (const row of out.values()) row.due = due.get(row.clientId) ?? null;
  }
  return [...out.values()];
}
