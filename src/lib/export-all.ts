import { addDays } from "@/lib/dates";
import { csvHours, type ExpenseCsvRow, entriesCsv, expensesCsv, invoicesCsv } from "@/lib/export-csv";
import {
  businessJson,
  clientsCsv,
  type ExportInvoice,
  type ExportRecords,
  invoiceJson,
  projectsCsv,
  teamCsv,
} from "@/lib/export-records";
import { buildTimesheetWorkbook } from "@/lib/export-xlsx";
import type { SheetEntry } from "@/lib/timesheet";
import { dateRange, exportableEntries } from "@/lib/timesheet";

/**
 * "Export everything": all of a user's time, all clients, all time, as one zip.
 *
 *   usehourly-export-<date>.zip
 *     README.txt            what is in the zip, with totals
 *     all-time.xlsx         every billable-day entry in one workbook (grid by week + entry list)
 *     all-entries.csv       every entry, one row each, with a Billable day column (opens anywhere, easy to import)
 *     invoices.csv          the invoice history (when there is any)
 *     invoices/<Number>.json    each invoice with its frozen snapshot (lines, seller, client)
 *     expenses.csv          every expense and mileage trip (when there is any)
 *     clients.csv, projects.csv, business.json, team.csv (when anyone was invited)
 *     by-client/<Client>.xlsx   one workbook per client
 *
 * Everything is built in the browser from data the signed-in user already owns.
 */

export type ExportFile = { path: string; content: string | Uint8Array };

/** A safe, readable file name from a client's name; unique within `taken`. */
export function fileNameFor(name: string, taken: Set<string>): string {
  // Drop control characters, then the characters that are not allowed in file names.
  const printable = [...name].filter((c) => c.charCodeAt(0) >= 32).join("");
  const base =
    printable
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+/, "")
      .slice(0, 80) || "Client";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) candidate = `${base} (${n++})`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** All the days a workbook should cover for these entries (earliest to latest). */
function span(entries: SheetEntry[]): string[] {
  const dates = entries.map((e) => e.date).sort();
  return dates.length ? dateRange(dates[0], dates[dates.length - 1], addDays) : [];
}

async function workbookBytes(entries: SheetEntry[], accountCurrency?: string): Promise<Uint8Array> {
  const wb = await buildTimesheetWorkbook({ entries, days: span(entries), range: true, accountCurrency });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export type ExportPlan = {
  files: ExportFile[];
  entryCount: number;
  clientCount: number;
  totalMinutes: number;
};

/** What `planExport` builds the zip from. */
export type ExportSource = {
  entries: SheetEntry[];
  /** Every invoice; with `detail: "full"` each also carries its notes and frozen snapshot. */
  invoices: ExportInvoice[];
  /** Every expense and trip (only fetched when the `expenses` switch is on). */
  expenses?: ExpenseCsvRow[];
  /** Clients, projects, business details and team (`dataExport.records`); without it those files are not written. */
  records?: ExportRecords;
  today: string;
  /** The account's currency, for clients that do not have one of their own. */
  accountCurrency?: string;
};

/** The entries of one client each, keyed by the client's name. */
function groupByClient(entries: SheetEntry[]): Map<string, SheetEntry[]> {
  const byClient = new Map<string, SheetEntry[]>();
  for (const e of entries) {
    const key = e.project.client.name;
    byClient.set(key, [...(byClient.get(key) ?? []), e]);
  }
  return byClient;
}

/** clients.csv, projects.csv, business.json and team.csv (only when someone was invited). */
function recordFiles(records: ExportRecords): ExportFile[] {
  return [
    { path: "clients.csv", content: clientsCsv(records.clients) },
    { path: "projects.csv", content: projectsCsv(records.projects) },
    { path: "business.json", content: businessJson(records.business) },
    ...(records.team.length ? [{ path: "team.csv", content: teamCsv(records.team) }] : []),
  ];
}

/** One `invoices/<number>.json` per invoice; the number goes through `fileNameFor`, so names are safe and unique. */
function invoiceFiles(invoices: ExportInvoice[]): ExportFile[] {
  const taken = new Set<string>();
  return invoices.map((i) => ({ path: `invoices/${fileNameFor(i.number, taken)}.json`, content: invoiceJson(i) }));
}

/** The README's line about entries on days marked non-billable (empty when there are none). */
function nonBillableLine(count: number): string[] {
  if (!count) return [];
  return count === 1
    ? ["1 entry is on a day marked non-billable: it is in all-entries.csv (Billable day = No), not in the workbooks."]
    : [
        `${count} entries are on days marked non-billable: they are in all-entries.csv (Billable day = No), not in the workbooks.`,
      ];
}

type ReadmeFacts = {
  source: ExportSource;
  listed: SheetEntry[];
  clientCount: number;
  hasWorkbooks: boolean;
  onNonBillableDays: number;
};

/** The README's "What is in this zip" list: one line per file or folder that is there. */
function contentsLines(source: ExportSource, hasWorkbooks: boolean): string[] {
  const { invoices, records } = source;
  const expenses = source.expenses ?? [];
  return [
    "  all-time.xlsx      Every entry in one workbook: a grid of hours by project and week, and the entry list.",
    "  all-entries.csv    Every entry, one row each. Opens in any spreadsheet or can be imported elsewhere.",
    ...(invoices.length ? [`  invoices.csv       Your invoice history (${invoices.length}).`] : []),
    ...(invoices.length ? ["  invoices/          One file per invoice: its lines, seller and client, as issued."] : []),
    ...(expenses.length ? [`  expenses.csv       Your expenses and mileage trips (${expenses.length}).`] : []),
    ...(records
      ? [
          "  clients.csv        Your clients: legal name, address, email, currency, rounding and invoice schedule.",
          "  projects.csv       Your projects: rate, billable, budget.",
          "  business.json      Your business details, as printed on invoices.",
        ]
      : []),
    ...(records?.team.length ? ["  team.csv           The people you invited: name, email and role."] : []),
    ...(hasWorkbooks ? ["  by-client/         One workbook per client, with the same two sheets."] : []),
  ];
}

/** README.txt: what is in the zip, with totals, one line per file that is there. */
function readmeText({ source, listed, clientCount, hasWorkbooks, onNonBillableDays }: ReadmeFacts): string {
  const totalMinutes = listed.reduce((a, e) => a + e.minutes, 0);
  const dates = listed.map((e) => e.date).sort();
  const lines = [
    "Your UseHourly export",
    `Created ${source.today}`,
    "",
    listed.length
      ? `${listed.length} entries, ${clientCount} ${clientCount === 1 ? "client" : "clients"}, ` +
        `${csvHours(totalMinutes)} hours, from ${dates[0]} to ${dates[dates.length - 1]}.`
      : "You have not logged any time yet.",
    "",
    "What is in this zip:",
    ...contentsLines(source, hasWorkbooks),
    "",
    "Hours are decimal (1.5 = one hour thirty). Amounts use each project's hourly rate, in the currency named on the row.",
    ...nonBillableLine(onNonBillableDays),
    "Logos and invoice PDFs are not included; each PDF can be made again from its invoices/*.json file.",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Builds every file in the zip. `today` (YYYY-MM-DD) goes in the README. Zero-minute entries (a timer that just
 * started) are left out everywhere. Entries on days marked non-billable are in all-entries.csv (Billable day = No) and
 * counted in `entryCount`, but not in the workbooks, which are billable grids.
 */
export async function planExport(source: ExportSource): Promise<ExportPlan> {
  const listed = source.entries.filter((e) => e.minutes > 0);
  const billable = exportableEntries(source.entries);
  const expenses = source.expenses ?? [];
  const currency = source.accountCurrency;
  const byClient = groupByClient(billable);
  const workbookClients = [...byClient.keys()].sort((a, b) => a.localeCompare(b));
  const clientCount = new Set(listed.map((e) => e.project.client.name)).size;

  const files: ExportFile[] = [
    { path: "all-time.xlsx", content: await workbookBytes(billable, currency) },
    { path: "all-entries.csv", content: entriesCsv(listed, currency, { billableDayColumn: true }) },
  ];
  if (source.invoices.length) files.push({ path: "invoices.csv", content: invoicesCsv(source.invoices) });
  if (expenses.length) files.push({ path: "expenses.csv", content: expensesCsv(expenses) });
  if (source.records) files.push(...recordFiles(source.records));
  files.push(...invoiceFiles(source.invoices));

  const taken = new Set<string>();
  for (const client of workbookClients) {
    const name = fileNameFor(client, taken);
    files.push({ path: `by-client/${name}.xlsx`, content: await workbookBytes(byClient.get(client) ?? [], currency) });
  }

  const onNonBillableDays = listed.length - billable.length;
  const hasWorkbooks = workbookClients.length > 0;
  files.unshift({
    path: "README.txt",
    content: readmeText({ source, listed, clientCount, hasWorkbooks, onNonBillableDays }),
  });

  const totalMinutes = listed.reduce((a, e) => a + e.minutes, 0);
  return { files, entryCount: listed.length, clientCount, totalMinutes };
}

/** Browser-only: zip the plan and trigger the download. JSZip is loaded on demand. */
export async function downloadExportZip(plan: ExportPlan, filename: string) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const f of plan.files) zip.file(f.path, f.content);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Zip the plan to bytes (used by the tests). */
export async function zipBytes(plan: ExportPlan): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const f of plan.files) zip.file(f.path, f.content);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
