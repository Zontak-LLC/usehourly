import { addDays } from "@/lib/dates";
import { buildTimesheetWorkbook } from "@/lib/export-xlsx";
import type { SheetEntry } from "@/lib/timesheet";
import { dateRange } from "@/lib/timesheet";

/**
 * "Export everything": all of a user's time, all clients, all time, as one zip.
 *
 *   hourly-export-<date>.zip
 *     README.txt            what is in the zip, with totals
 *     all-time.xlsx         every entry in one workbook (grid by week + entry list)
 *     all-entries.csv       every entry, one row each (opens anywhere, easy to import)
 *     invoices.csv          the invoice history (when there is any)
 *     by-client/<Client>.xlsx   one workbook per client
 *
 * Everything is built in the browser from data the signed-in user already owns.
 */

export type InvoiceRow = {
  number: string;
  client_name: string;
  issue_date: string;
  due_date: string | null;
  paid_date: string | null;
  period_from: string;
  period_to: string;
  total_minutes: number;
  total_cents: number;
};

export type ExportFile = { path: string; content: string | Uint8Array };

const hours = (m: number) => Math.round((m / 60) * 100) / 100;

/** RFC 4180 field: quoted when it holds a comma, quote or line break; quotes doubled. */
export function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  // The BOM makes Excel read the file as UTF-8, so names like "Café" survive.
  return `﻿${rows.map((r) => r.map(csvField).join(",")).join("\r\n")}\r\n`;
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

export function entriesCsv(entries: SheetEntry[]): string {
  const rows: (string | number | null)[][] = [
    ["Date", "Client", "Project", "Note", "Hours", "Minutes", "Billable", "Rate ($/h)", "Amount ($)"],
  ];
  const sorted = [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.project.client.name.localeCompare(b.project.client.name) ||
      a.project.name.localeCompare(b.project.name),
  );
  for (const e of sorted) {
    const rate = e.project.hourly_rate / 100;
    const amount = e.project.billable && rate ? Math.round(hours(e.minutes) * rate * 100) / 100 : null;
    rows.push([
      e.date,
      e.project.client.name,
      e.project.name,
      e.note,
      hours(e.minutes),
      e.minutes,
      e.project.billable ? "Yes" : "No",
      rate || null,
      amount,
    ]);
  }
  return toCsv(rows);
}

export function invoicesCsv(invoices: InvoiceRow[]): string {
  const rows: (string | number | null)[][] = [
    ["Number", "Client", "Issued", "Due", "Paid", "Period from", "Period to", "Hours", "Total ($)", "Status"],
  ];
  for (const i of invoices) {
    rows.push([
      i.number,
      i.client_name,
      i.issue_date,
      i.due_date,
      i.paid_date,
      i.period_from,
      i.period_to,
      hours(i.total_minutes),
      i.total_cents / 100,
      i.paid_date ? "Paid" : "Unpaid",
    ]);
  }
  return toCsv(rows);
}

/** All the days a workbook should cover for these entries (earliest to latest). */
function span(entries: SheetEntry[]): string[] {
  const dates = entries.map((e) => e.date).sort();
  return dates.length ? dateRange(dates[0], dates[dates.length - 1], addDays) : [];
}

async function workbookBytes(entries: SheetEntry[]): Promise<Uint8Array> {
  const wb = await buildTimesheetWorkbook({ entries, days: span(entries), range: true });
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
  today: string;
}): Promise<ExportPlan> {
  const entries = opts.entries.filter((e) => e.minutes > 0);
  const files: ExportFile[] = [];

  const byClient = new Map<string, SheetEntry[]>();
  for (const e of entries) {
    const key = e.project.client.name;
    byClient.set(key, [...(byClient.get(key) ?? []), e]);
  }
  const clients = [...byClient.keys()].sort((a, b) => a.localeCompare(b));

  files.push({ path: "all-time.xlsx", content: await workbookBytes(entries) });
  files.push({ path: "all-entries.csv", content: entriesCsv(entries) });
  if (opts.invoices.length) files.push({ path: "invoices.csv", content: invoicesCsv(opts.invoices) });

  const taken = new Set<string>();
  for (const client of clients) {
    const name = fileNameFor(client, taken);
    files.push({ path: `by-client/${name}.xlsx`, content: await workbookBytes(byClient.get(client) ?? []) });
  }

  const totalMinutes = entries.reduce((a, e) => a + e.minutes, 0);
  const dates = entries.map((e) => e.date).sort();
  const lines = [
    "Your Hourly export",
    `Created ${opts.today}`,
    "",
    entries.length
      ? `${entries.length} entries, ${clients.length} ${clients.length === 1 ? "client" : "clients"}, ` +
        `${hours(totalMinutes)} hours, from ${dates[0]} to ${dates[dates.length - 1]}.`
      : "You have not logged any time yet.",
    "",
    "What is in this zip:",
    "  all-time.xlsx      Every entry in one workbook: a grid of hours by project and week, and the entry list.",
    "  all-entries.csv    Every entry, one row each. Opens in any spreadsheet or can be imported elsewhere.",
    ...(opts.invoices.length
      ? [
          `  invoices.csv       Your invoice history (${opts.invoices.length}${opts.invoices.length >= 200 ? ", the 200 most recent" : ""}).`,
        ]
      : []),
    ...(clients.length ? ["  by-client/         One workbook per client, with the same two sheets."] : []),
    "",
    "Hours are decimal (1.5 = one hour thirty). Amounts use each project's hourly rate.",
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
