import { addDays } from "@/lib/dates";
import { csvHours, type ExpenseCsvRow, entriesCsv, expensesCsv, type InvoiceRow, invoicesCsv } from "@/lib/export-csv";
import { buildTimesheetWorkbook } from "@/lib/export-xlsx";
import type { SheetEntry } from "@/lib/timesheet";
import { dateRange, exportableEntries } from "@/lib/timesheet";

/**
 * "Export everything": all of a user's time, all clients, all time, as one zip.
 *
 *   usehourly-export-<date>.zip
 *     README.txt            what is in the zip, with totals
 *     all-time.xlsx         every entry in one workbook (grid by week + entry list)
 *     all-entries.csv       every entry, one row each (opens anywhere, easy to import)
 *     invoices.csv          the invoice history (when there is any)
 *     expenses.csv          every expense and mileage trip (when there is any)
 *     by-client/<Client>.xlsx   one workbook per client
 *
 * Everything is built in the browser from data the signed-in user already owns.
 */

export type ExportFile = { path: string; content: string | Uint8Array };

/** At most this many pages per list, so a server that keeps sending a cursor cannot loop forever. */
const MAX_PAGES = 200;

/**
 * Every row of a cursor-paged list (`entry.listAll`, `expense.listAll`, `invoice.listAll`), fetched a page at a time so
 * no single response is huge.
 */
export async function fetchAllPages<T>(
  fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchPage(cursor);
    all.push(...res.items);
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return all;
}

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

/**
 * Builds every file in the zip. `today` (YYYY-MM-DD) goes in the README. Zero-minute entries
 * (a timer that just started) are left out everywhere, as in the single-range exports.
 */
export async function planExport(opts: {
  entries: SheetEntry[];
  invoices: InvoiceRow[];
  /** Every expense and trip (only fetched when the `expenses` switch is on). */
  expenses?: ExpenseCsvRow[];
  today: string;
  /** The account's currency, for clients that do not have one of their own. */
  accountCurrency?: string;
}): Promise<ExportPlan> {
  // Entries on days marked non-billable are left out of every file, and the README says how many.
  const entries = exportableEntries(opts.entries);
  const leftOut = opts.entries.filter((e) => e.minutes > 0 && e.non_billable).length;
  const files: ExportFile[] = [];
  const expenses = opts.expenses ?? [];

  const byClient = new Map<string, SheetEntry[]>();
  for (const e of entries) {
    const key = e.project.client.name;
    byClient.set(key, [...(byClient.get(key) ?? []), e]);
  }
  const clients = [...byClient.keys()].sort((a, b) => a.localeCompare(b));

  files.push({ path: "all-time.xlsx", content: await workbookBytes(entries, opts.accountCurrency) });
  files.push({ path: "all-entries.csv", content: entriesCsv(entries, opts.accountCurrency) });
  if (opts.invoices.length) files.push({ path: "invoices.csv", content: invoicesCsv(opts.invoices) });
  if (expenses.length) files.push({ path: "expenses.csv", content: expensesCsv(expenses) });

  const taken = new Set<string>();
  for (const client of clients) {
    const name = fileNameFor(client, taken);
    files.push({
      path: `by-client/${name}.xlsx`,
      content: await workbookBytes(byClient.get(client) ?? [], opts.accountCurrency),
    });
  }

  const totalMinutes = entries.reduce((a, e) => a + e.minutes, 0);
  const dates = entries.map((e) => e.date).sort();
  const lines = [
    "Your UseHourly export",
    `Created ${opts.today}`,
    "",
    entries.length
      ? `${entries.length} entries, ${clients.length} ${clients.length === 1 ? "client" : "clients"}, ` +
        `${csvHours(totalMinutes)} hours, from ${dates[0]} to ${dates[dates.length - 1]}.`
      : "You have not logged any time yet.",
    "",
    "What is in this zip:",
    "  all-time.xlsx      Every entry in one workbook: a grid of hours by project and week, and the entry list.",
    "  all-entries.csv    Every entry, one row each. Opens in any spreadsheet or can be imported elsewhere.",
    ...(opts.invoices.length ? [`  invoices.csv       Your invoice history (${opts.invoices.length}).`] : []),
    ...(expenses.length ? [`  expenses.csv       Your expenses and mileage trips (${expenses.length}).`] : []),
    ...(clients.length ? ["  by-client/         One workbook per client, with the same two sheets."] : []),
    "",
    "Hours are decimal (1.5 = one hour thirty). Amounts use each project's hourly rate, in the currency named on the row.",
    ...(leftOut
      ? [
          `${leftOut} ${leftOut === 1 ? "entry" : "entries"} on days marked non-billable ${leftOut === 1 ? "was" : "were"} left out.`,
        ]
      : []),
  ];
  files.unshift({ path: "README.txt", content: `${lines.join("\r\n")}\r\n` });

  return { files, entryCount: entries.length, clientCount: clients.length, totalMinutes };
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
