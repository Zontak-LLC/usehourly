import { billedMinutes, NO_ROUNDING, type Rounding } from "./rounding";

/** Pure invoice math, shared by the server (which snapshots) and the builder page (live preview). */

export type InvoiceEntry = {
  date: string;
  minutes: number;
  note: string;
  started_at: Date | string | null;
  project_id: string;
  project: { name: string; hourly_rate: number; billable: boolean; client_id?: string };
};

export type InvoiceLine = {
  projectId: string;
  project: string;
  minutes: number;
  rateCents: number;
  amountCents: number;
};

export type InvoiceDetailRow = { date: string; project: string; note: string; minutes: number };

export type InvoiceTotals = {
  lines: InvoiceLine[];
  detail: InvoiceDetailRow[];
  totalMinutes: number;
  /** Minutes actually logged; differs from totalMinutes only when a rounding rule applies. */
  loggedMinutes: number;
  totalCents: number;
  /** Billable projects included at a $0 rate — almost certainly a missing rate. */
  zeroRateProjects: string[];
  /** Minutes on non-billable projects, left off the invoice. */
  skippedMinutes: number;
  runningTimers: number;
};

/** Amount for `minutes` at `rateCents`/hour, rounded once per line to the nearest cent. */
export function amountCents(minutes: number, rateCents: number): number {
  return Math.round((minutes * rateCents) / 60);
}

export function buildInvoice(entries: InvoiceEntry[], rounding: Rounding = NO_ROUNDING): InvoiceTotals {
  const byProject = new Map<string, InvoiceLine>();
  const detail: InvoiceDetailRow[] = [];
  let skippedMinutes = 0;
  let runningTimers = 0;
  let loggedMinutes = 0;

  for (const e of entries) {
    if (!e.project.billable) {
      skippedMinutes += e.minutes;
      continue;
    }
    if (e.started_at) runningTimers += 1;
    // Zero-hour entries (e.g. a timer just started) add nothing to bill; keep them off the invoice.
    if (e.minutes <= 0) continue;
    const line = byProject.get(e.project_id) ?? {
      projectId: e.project_id,
      project: e.project.name,
      minutes: 0,
      rateCents: e.project.hourly_rate,
      amountCents: 0,
    };
    const billed = billedMinutes(e.minutes, rounding);
    loggedMinutes += e.minutes;
    line.minutes += billed;
    byProject.set(e.project_id, line);
    detail.push({ date: e.date, project: e.project.name, note: e.note, minutes: billed });
  }

  const lines = [...byProject.values()]
    .map((l) => ({ ...l, amountCents: amountCents(l.minutes, l.rateCents) }))
    .sort((a, b) => a.project.localeCompare(b.project));
  detail.sort((a, b) => a.date.localeCompare(b.date) || a.project.localeCompare(b.project));

  return {
    lines,
    detail,
    totalMinutes: lines.reduce((a, l) => a + l.minutes, 0),
    loggedMinutes,
    totalCents: lines.reduce((a, l) => a + l.amountCents, 0),
    zeroRateProjects: lines.filter((l) => l.rateCents === 0).map((l) => l.project),
    skippedMinutes,
    runningTimers,
  };
}

export type InvoiceSnapshot = {
  seller: {
    name: string;
    ein: string | null;
    address: string | null;
    email: string;
    logo: string | null;
    // absent on invoices issued before it existed.
    paymentInstructions?: string | null;
    /** sha-256 of the logo stored in invoice_logos (new invoices keep `logo` null and point here). */
    logoHash?: string | null;
  };
  // address/logo are absent on invoices issued before they existed.
  client: {
    name: string;
    legalName?: string | null;
    address?: string | null;
    logo?: string | null;
    logoHash?: string | null;
  };
  number: string;
  issueDate: string;
  dueDate: string | null;
  periodFrom: string;
  periodTo: string;
  notes: string;
  includeDetail: boolean;
  /** Line items show only the first line of each description (full text stays in the time detail). */
  compactNotes?: boolean;
  /**
   * Print "Made with UseHourly" at the foot of each page. Frozen when the invoice is issued, from the
   * seller's setting at that moment; absent on invoices issued before it existed, which stay unbranded.
   */
  branding?: boolean;
  /** The client's rounding rule when the invoice was issued; absent = exact minutes. Minutes above are already rounded. */
  rounding?: Rounding;
  /** Minutes actually logged, kept when a rounding rule changed the billed total. */
  loggedMinutes?: number;
  lines: InvoiceLine[];
  detail: InvoiceDetailRow[];
  totalMinutes: number;
  totalCents: number;
};

export const formatMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** Lowercase blob the history search matches against. */
export function buildSearchText(s: InvoiceSnapshot): string {
  return [
    s.number,
    s.client.name,
    s.client.legalName ?? "",
    s.notes,
    ...s.lines.map((l) => l.project),
    ...s.detail.map((d) => d.note),
    s.issueDate,
    formatMoney(s.totalCents),
  ]
    .join(" \n ")
    .toLowerCase();
}
