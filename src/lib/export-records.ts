import { toCsv } from "@/lib/csv";
import { csvHours, type InvoiceRow } from "@/lib/export-csv";
import type { InvoiceSnapshot } from "@/lib/invoice";
import type { InviteStatus } from "@/lib/team";

/**
 * The "Download everything" files for what a person set up rather than logged: clients, projects, business details,
 * team members, and one JSON file per invoice. Plain text only; `planExport` in `export-all.ts` puts them in the zip.
 */

/** One client as `dataExport.records` returns it (no logo). `currency` is already the effective one. */
export type ClientRecord = {
  name: string;
  legalName: string | null;
  address: string | null;
  email: string | null;
  currency: string;
  color: string;
  roundStep: number;
  roundMode: string;
  roundMin: number;
  invoiceEvery: string | null;
  invoiceAnchor: string | null;
  archived: boolean;
};

/** One project with its client's name. `hourlyRate` is cents; `budgetAmount` minutes (hours) or cents (dollars). */
export type ProjectRecord = {
  clientName: string;
  name: string;
  hourlyRate: number;
  billable: boolean;
  budgetAmount: number | null;
  budgetUnit: string | null;
  budgetPeriod: string;
  archived: boolean;
};

/** The account's business details as `business.json` writes them (money in currency units, tax in percent). */
export type BusinessRecord = {
  name: string | null;
  email: string;
  businessName: string | null;
  ein: string | null;
  address: string | null;
  paymentInstructions: string | null;
  taxName: string | null;
  taxRatePercent: number | null;
  taxNumber: string | null;
  currency: string;
  defaultHourlyRate: number;
};

/** One person the account invited: name, email and where the invitation stands. */
export type TeamRecord = { name: string; email: string; status: InviteStatus };

/** Everything `dataExport.records` returns in one call. */
export type ExportRecords = {
  business: BusinessRecord;
  clients: ClientRecord[];
  projects: ProjectRecord[];
  team: TeamRecord[];
};

/** One invoice as the zip reads it: `invoice.listAll({ detail: "full" })` adds the notes and the frozen snapshot. */
export type ExportInvoice = InvoiceRow & { notes?: string; snapshot?: InvoiceSnapshot };

const yesNo = (value: boolean) => (value ? "Yes" : "No");

/** Every client, archived ones too, sorted by name. Returns the CSV text. */
export function clientsCsv(clients: ClientRecord[]): string {
  const rows: (string | number | null)[][] = [
    [
      "Name",
      "Legal name",
      "Address",
      "Email",
      "Currency",
      "Colour",
      "Rounding step (minutes)",
      "Rounding mode",
      "Minimum minutes",
      "Invoice every",
      "Invoice anchor",
      "Archived",
    ],
  ];
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));
  for (const c of sorted) {
    rows.push([
      c.name,
      c.legalName,
      c.address,
      c.email,
      c.currency,
      c.color,
      c.roundStep,
      c.roundMode,
      c.roundMin,
      c.invoiceEvery,
      c.invoiceAnchor,
      yesNo(c.archived),
    ]);
  }
  return toCsv(rows);
}

/** A budget in its own unit: hours for an hours budget (stored as minutes), money for a dollars one (cents). */
function budgetValue(p: ProjectRecord): number | null {
  if (p.budgetAmount === null) return null;
  return p.budgetUnit === "hours" ? csvHours(p.budgetAmount) : p.budgetAmount / 100;
}

/** Every project, archived ones too, sorted by client and then by name. Returns the CSV text. */
export function projectsCsv(projects: ProjectRecord[]): string {
  const rows: (string | number | null)[][] = [
    ["Client", "Project", "Rate (per hour)", "Billable", "Budget", "Budget unit", "Budget period", "Archived"],
  ];
  const sorted = [...projects].sort((a, b) => a.clientName.localeCompare(b.clientName) || a.name.localeCompare(b.name));
  for (const p of sorted) {
    const hasBudget = p.budgetAmount !== null;
    rows.push([
      p.clientName,
      p.name,
      p.hourlyRate / 100,
      yesNo(p.billable),
      budgetValue(p),
      hasBudget ? p.budgetUnit : null,
      hasBudget ? p.budgetPeriod : null,
      yesNo(p.archived),
    ]);
  }
  return toCsv(rows);
}

const ROLE_WORDS: Record<InviteStatus, string> = {
  active: "Member",
  pending: "Invited",
  expired: "Invite expired",
  removed: "Removed",
};

/** The people the account invited, in the order given (oldest invitation first). Returns the CSV text. */
export function teamCsv(team: TeamRecord[]): string {
  return toCsv([["Name", "Email", "Role"], ...team.map((m) => [m.name, m.email, ROLE_WORDS[m.status]])]);
}

/** The business details as pretty-printed JSON (2-space indent). */
export function businessJson(business: BusinessRecord): string {
  return `${JSON.stringify(business, null, 2)}\n`;
}

/**
 * One invoice as pretty-printed JSON: its list fields plus the frozen snapshot exactly as stored (lines, seller,
 * client; a logo stays a hash). `snapshot` is null when the caller read the list without `detail: "full"`.
 */
export function invoiceJson(invoice: ExportInvoice): string {
  const file = {
    number: invoice.number,
    clientName: invoice.client_name,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    paidDate: invoice.paid_date,
    periodFrom: invoice.period_from,
    periodTo: invoice.period_to,
    totalMinutes: invoice.total_minutes,
    totalCents: invoice.total_cents,
    currency: invoice.currency,
    notes: invoice.notes ?? null,
    snapshot: invoice.snapshot ?? null,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}
