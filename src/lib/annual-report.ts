import { amountCents } from "@/lib/invoice";

export type ReportEntry = { date: string; minutes: number; project_id: string };
export type ReportProject = {
  id: string;
  name: string;
  hourly_rate: number; // cents
  billable: boolean;
  client_id: string;
  client_name: string;
};
export type ReportInvoice = {
  number: string;
  client_name: string;
  issue_date: string;
  /** Date the money arrived, or null while unpaid. */
  paid_date: string | null;
  total_cents: number;
  total_minutes: number;
};

export type Bucket = { minutes: number; billableMinutes: number; earnedCents: number };

export type AnnualReport = {
  year: number;
  totals: Bucket & { nonBillableMinutes: number; entryCount: number; workedDays: number };
  /** `receivedCents` = payments that landed in that month/quarter (by paid date). */
  months: (Bucket & { month: number; receivedCents: number })[]; // 12
  quarters: (Bucket & { quarter: number; receivedCents: number })[]; // 4
  projects: (Bucket & {
    projectId: string;
    project: string;
    clientId: string;
    client: string;
    billable: boolean;
    rateCents: number;
  })[];
  clients: (Bucket & { clientId: string; client: string; projects: number })[];
  /** Invoices issued in the year (accrual view). */
  invoices: { count: number; totalCents: number; list: ReportInvoice[] };
  /** Payments received in the year, whatever year the invoice was issued (cash view). */
  received: { count: number; totalCents: number; list: ReportInvoice[] };
  /** Issued this year and still unpaid at year end. */
  outstanding: { count: number; totalCents: number };
};

const empty = (): Bucket => ({ minutes: 0, billableMinutes: 0, earnedCents: 0 });

/**
 * Year summary for tax time. "Earned" is billable hours x the project's current hourly rate:
 * it is what the time is worth, not what has been paid. Each (project, month) is rounded to
 * the cent once, then summed, so the monthly, quarterly, per-project and yearly totals always
 * agree with one another.
 */
export function buildAnnualReport(input: {
  year: number;
  entries: ReportEntry[];
  projects: ReportProject[];
  invoices: ReportInvoice[];
}): AnnualReport {
  const { year } = input;
  const byProject = new Map(input.projects.map((p) => [p.id, p]));
  const prefix = `${year}-`;

  // minutes per (project, month)
  const cells = new Map<string, number>();
  const days = new Set<string>();
  let entryCount = 0;
  for (const e of input.entries) {
    if (!e.date.startsWith(prefix) || !byProject.has(e.project_id)) continue;
    const month = Number(e.date.slice(5, 7));
    if (month < 1 || month > 12) continue;
    const key = `${e.project_id}|${month}`;
    cells.set(key, (cells.get(key) ?? 0) + e.minutes);
    entryCount += 1;
    if (e.minutes > 0) days.add(e.date);
  }

  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, receivedCents: 0, ...empty() }));
  const projects = new Map<string, AnnualReport["projects"][number]>();
  const clients = new Map<string, AnnualReport["clients"][number]>();
  const totals = { ...empty(), nonBillableMinutes: 0, entryCount, workedDays: days.size };

  for (const [key, minutes] of cells) {
    const [projectId, monthText] = key.split("|");
    const month = Number(monthText);
    const p = byProject.get(projectId);
    if (!p) continue;
    const billable = p.billable ? minutes : 0;
    const earned = p.billable ? amountCents(minutes, p.hourly_rate) : 0;

    const m = months[month - 1];
    m.minutes += minutes;
    m.billableMinutes += billable;
    m.earnedCents += earned;

    const pr =
      projects.get(projectId) ??
      ({
        projectId,
        project: p.name,
        clientId: p.client_id,
        client: p.client_name,
        billable: p.billable,
        rateCents: p.hourly_rate,
        ...empty(),
      } satisfies AnnualReport["projects"][number]);
    pr.minutes += minutes;
    pr.billableMinutes += billable;
    pr.earnedCents += earned;
    projects.set(projectId, pr);

    totals.minutes += minutes;
    totals.billableMinutes += billable;
    totals.earnedCents += earned;
    if (!p.billable) totals.nonBillableMinutes += minutes;
  }

  for (const pr of projects.values()) {
    const c =
      clients.get(pr.clientId) ??
      ({ clientId: pr.clientId, client: pr.client, projects: 0, ...empty() } satisfies AnnualReport["clients"][number]);
    c.projects += 1;
    c.minutes += pr.minutes;
    c.billableMinutes += pr.billableMinutes;
    c.earnedCents += pr.earnedCents;
    clients.set(pr.clientId, c);
  }

  // Cash view: payments are placed by the date the money arrived.
  const received = input.invoices
    .filter((i) => i.paid_date?.startsWith(prefix))
    .sort((a, b) => (a.paid_date as string).localeCompare(b.paid_date as string) || a.number.localeCompare(b.number));
  for (const i of received) {
    const month = Number((i.paid_date as string).slice(5, 7));
    if (month >= 1 && month <= 12) months[month - 1].receivedCents += i.total_cents;
  }

  const quarters = [1, 2, 3, 4].map((q) => {
    const parts = months.slice((q - 1) * 3, q * 3);
    return {
      quarter: q,
      minutes: parts.reduce((a, m) => a + m.minutes, 0),
      billableMinutes: parts.reduce((a, m) => a + m.billableMinutes, 0),
      earnedCents: parts.reduce((a, m) => a + m.earnedCents, 0),
      receivedCents: parts.reduce((a, m) => a + m.receivedCents, 0),
    };
  });

  const invoices = input.invoices
    .filter((i) => i.issue_date.startsWith(prefix))
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.number.localeCompare(b.number));
  const yearEnd = `${year}-12-31`;
  const open = invoices.filter((i) => !i.paid_date || i.paid_date > yearEnd);

  return {
    year,
    totals,
    months,
    quarters,
    projects: [...projects.values()].sort((a, b) => b.earnedCents - a.earnedCents || b.minutes - a.minutes),
    clients: [...clients.values()].sort((a, b) => b.earnedCents - a.earnedCents || b.minutes - a.minutes),
    invoices: {
      count: invoices.length,
      totalCents: invoices.reduce((a, i) => a + i.total_cents, 0),
      list: invoices,
    },
    received: {
      count: received.length,
      totalCents: received.reduce((a, i) => a + i.total_cents, 0),
      list: received,
    },
    outstanding: { count: open.length, totalCents: open.reduce((a, i) => a + i.total_cents, 0) },
  };
}
