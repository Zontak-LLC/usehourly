import type { PrismaClient } from "@prisma/client";

import { buildAnnualReport } from "@/lib/annual-report";
import { CURRENCY_CODES, type CurrencyCode, effectiveCurrency } from "@/lib/money";

import { nonBillableDates } from "./non-billable";

/**
 * One calendar year of an account's time and invoices, summarized for tax time, in ONE currency (amounts in different
 * currencies are never added together; the default is the account's). Shared by the year summary page and the emailed
 * copy, so the two always say the same thing. Everything is read for `userId` only.
 */
export async function yearReport(
  prisma: PrismaClient,
  userId: string,
  input: { year: number; currency?: CurrencyCode },
) {
  const from = `${input.year}-01-01`;
  const to = `${input.year}-12-31`;
  const [allEntries, skipDays, projects, invoices, user] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { user_id: userId, date: { gte: from, lte: to } },
      select: { date: true, minutes: true, project_id: true },
    }),
    nonBillableDates(prisma, userId, { from, to }),
    // Archived projects included: their past time still belongs in the year.
    prisma.project.findMany({
      where: { user_id: userId },
      omit: { logo: true },
      include: { client: { select: { id: true, name: true, currency: true } } },
    }),
    prisma.invoice.findMany({
      // Issued in the year (accrual) or paid in it (cash), whichever year it was issued.
      where: {
        user_id: userId,
        OR: [{ issue_date: { gte: from, lte: to } }, { paid_date: { gte: from, lte: to } }],
      },
      select: {
        number: true,
        client_name: true,
        issue_date: true,
        paid_date: true,
        total_cents: true,
        total_minutes: true,
        currency: true,
      },
    }),
    prisma.authUser.findUnique({ where: { id: userId }, select: { currency: true } }),
  ]);
  const accountCurrency = effectiveCurrency(null, user?.currency);
  const projectCurrency = new Map(projects.map((p) => [p.id, effectiveCurrency(p.client.currency, accountCurrency)]));

  // The currencies this year actually has money in: those of projects with time, and of invoices.
  const used = new Set<CurrencyCode>();
  for (const e of allEntries) {
    const c = projectCurrency.get(e.project_id);
    if (c) used.add(c);
  }
  for (const i of invoices) used.add(effectiveCurrency(i.currency, accountCurrency));
  const currencies = CURRENCY_CODES.filter((c) => used.has(c));
  const currency: CurrencyCode =
    input.currency ?? (used.size === 0 || used.has(accountCurrency) ? accountCurrency : currencies[0]);

  // Days marked non-billable are left out of the year summary entirely.
  const entries = allEntries.filter((e) => !skipDays.has(e.date) && projectCurrency.get(e.project_id) === currency);

  const report = buildAnnualReport({
    year: input.year,
    entries,
    projects: projects
      .filter((p) => projectCurrency.get(p.id) === currency)
      .map((p) => ({
        id: p.id,
        name: p.name,
        hourly_rate: p.hourly_rate,
        billable: p.billable,
        client_id: p.client.id,
        client_name: p.client.name,
      })),
    invoices: invoices.filter((i) => effectiveCurrency(i.currency, accountCurrency) === currency),
  });
  return { ...report, currency, currencies: currencies.length > 0 ? currencies : [currency] };
}
