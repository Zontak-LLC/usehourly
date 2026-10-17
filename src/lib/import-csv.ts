import { parseDuration } from "@/lib/duration";
import { NOTE_MAX } from "@/lib/notes";

/**
 * Reads a time export from Toggl Track or Clockify (or any CSV with a date, a duration and,
 * ideally, a project) into entries UseHourly can store. Pure and browser-safe: the page parses and
 * previews the file locally, and only the cleaned rows are sent to the server.
 */

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 20_000;
/** Most rows one server call carries; the page sends bigger files in several calls. */
export const IMPORT_CHUNK = 300;
export const DEFAULT_CLIENT = "No client";
export const DEFAULT_PROJECT = "General";
const NAME_MAX = 80;

export type ImportRow = {
  client: string;
  project: string;
  /** YYYY-MM-DD */
  date: string;
  minutes: number;
  note: string;
  /** null when the file doesn't say */
  billable: boolean | null;
  /** cents per hour, null when the file doesn't say */
  rateCents: number | null;
};

export type ImportFormat = "toggl" | "clockify" | "generic";
export type DateOrder = "mdy" | "dmy";

export type ImportPreview = {
  format: ImportFormat;
  rows: ImportRow[];
  skipped: { line: number; reason: string }[];
  /** How non-ISO dates were read. */
  dateOrder: DateOrder;
  /** True when dates like 03/04/2026 could be read either way, so the person should confirm. */
  dateOrderAmbiguous: boolean;
  /** Example of an ambiguous date from the file, for the question. */
  dateSample: string | null;
  truncatedNotes: number;
  totalMinutes: number;
  from: string | null;
  to: string | null;
  clients: string[];
  projects: { client: string; project: string; entries: number; minutes: number }[];
};

export type ImportResult = { ok: true; preview: ImportPreview } | { ok: false; error: string };

// ---------------------------------------------------------------------------------- CSV reading

/** RFC 4180 reader: quoted fields, doubled quotes, line breaks inside quotes, CRLF, a leading BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].reduce(
    (best, d) => (count(firstLine, d) > count(firstLine, best) ? d : best),
    ",",
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const count = (s: string, ch: string) => s.split(ch).length - 1;

// ------------------------------------------------------------------------------------- columns

const norm = (h: string) => h.replace(/^﻿/, "").trim().toLowerCase().replace(/\s+/g, " ");

function findColumn(headers: string[], names: string[]): number {
  for (const n of names) {
    const i = headers.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

export function detectFormat(headers: string[]): ImportFormat {
  const h = headers.map(norm);
  if (
    h.includes("duration (decimal)") ||
    h.includes("billable amount (usd)") ||
    (h.includes("group") && h.includes("duration (h)"))
  ) {
    return "clockify";
  }
  if (h.includes("user") && h.includes("email") && h.includes("start date") && h.includes("duration")) return "toggl";
  return "generic";
}

const DATE_COLUMNS = ["start date", "date", "day", "start", "work date"];
// HH:MM:SS columns first (exact to the second), then decimal-hour columns.
const DURATION_COLUMNS = [
  "duration (h)",
  "duration",
  "time (h)",
  "time tracked (h)",
  "duration (decimal)",
  "time (decimal)",
  "hours (decimal)",
  "hours",
  "time",
];

// -------------------------------------------------------------------------------------- values

function parseDurationCell(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  let m = /^(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0);
  m = /^\d+(?:[.,]\d+)?$/.exec(s);
  if (m) return Number(s.replace(",", ".")) * 60; // a bare number in an hours column is hours
  const viaText = parseDuration(s);
  return viaText ?? null;
}

type Parts = { a: number; b: number; year: number };

function splitDate(raw: string): { iso: [number, number, number] } | { loose: Parts } | null {
  const first = raw.trim().split(/[ T]/, 1)[0] ?? "";
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(first);
  if (m) return { iso: [Number(m[1]), Number(m[2]), Number(m[3])] };
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(first);
  if (m) {
    const y = Number(m[3]);
    return { loose: { a: Number(m[1]), b: Number(m[2]), year: y < 100 ? 2000 + y : y } };
  }
  return null;
}

function toIso(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDateCell(raw: string, order: DateOrder): string | null {
  const p = splitDate(raw);
  if (!p) return null;
  if ("iso" in p) return toIso(...p.iso);
  return order === "dmy" ? toIso(p.loose.year, p.loose.b, p.loose.a) : toIso(p.loose.year, p.loose.a, p.loose.b);
}

function chooseDateOrder(
  dates: string[],
  wanted?: DateOrder,
): { order: DateOrder; ambiguous: boolean; sample: string | null } {
  let dmy = false;
  let mdy = false;
  let sample: string | null = null;
  for (const raw of dates) {
    const p = splitDate(raw);
    if (!p || "iso" in p) continue;
    sample ??= raw.trim().split(/[ T]/, 1)[0] ?? raw;
    if (p.loose.a > 12) dmy = true;
    if (p.loose.b > 12) mdy = true;
  }
  if (sample === null) return { order: wanted ?? "mdy", ambiguous: false, sample: null };
  if (dmy && !mdy) return { order: "dmy", ambiguous: false, sample };
  if (mdy && !dmy) return { order: "mdy", ambiguous: false, sample };
  // Either way round (or contradictory): the US reading is the default, and the person is asked.
  return { order: wanted ?? "mdy", ambiguous: true, sample };
}

const clean = (s: string | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
const cap = (s: string) => (s.length > NAME_MAX ? s.slice(0, NAME_MAX).trim() : s);

function parseBillable(raw: string | undefined): boolean | null {
  const v = clean(raw).toLowerCase();
  if (["yes", "true", "1", "y", "billable"].includes(v)) return true;
  if (["no", "false", "0", "n", "non-billable", "non billable"].includes(v)) return false;
  return null;
}

function parseRate(raw: string | undefined): number | null {
  const v = clean(raw)
    .replace(/[^0-9.,-]/g, "")
    .replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 10_000 ? Math.round(n * 100) : null;
}

// ----------------------------------------------------------------------------------- the import

export function readTimeCsv(text: string, opts: { dateOrder?: DateOrder } = {}): ImportResult {
  if (text.length > MAX_IMPORT_BYTES)
    return { ok: false, error: "That file is larger than 5 MB. Export a shorter date range and try again." };
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false, error: "That file has no time entries in it." };
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `That file has more than ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows. Export one year at a time.`,
    };
  }

  const headers = table[0].map(norm);
  const format = detectFormat(table[0]);
  const dateCol = findColumn(headers, DATE_COLUMNS);
  const durationCols = DURATION_COLUMNS.map((n) => headers.indexOf(n)).filter((i) => i >= 0);
  if (dateCol < 0)
    return { ok: false, error: 'I couldn\'t find a date column. The file needs a "Start date" or "Date" column.' };
  if (durationCols.length === 0) {
    return { ok: false, error: 'I couldn\'t find a duration column. The file needs a "Duration" or "Hours" column.' };
  }
  const clientCol = findColumn(headers, ["client"]);
  const projectCol = findColumn(headers, ["project"]);
  const noteCol = findColumn(headers, ["description", "note", "notes", "task description"]);
  const billableCol = findColumn(headers, ["billable"]);
  const rateCol = headers.findIndex((h) => /^(billable )?rate\b/.test(h));

  const body = table.slice(1);
  const { order, ambiguous, sample } = chooseDateOrder(
    body.map((r) => r[dateCol] ?? ""),
    opts.dateOrder,
  );
  const dateOrder = opts.dateOrder ?? order;

  const rows: ImportRow[] = [];
  const skipped: ImportPreview["skipped"] = [];
  let truncatedNotes = 0;
  body.forEach((r, i) => {
    const line = i + 2;
    const date = parseDateCell(r[dateCol] ?? "", dateOrder);
    if (!date) {
      skipped.push({ line, reason: clean(r[dateCol]) ? `Couldn't read the date "${clean(r[dateCol])}"` : "No date" });
      return;
    }
    let minutes: number | null = null;
    for (const c of durationCols) {
      minutes = parseDurationCell(r[c] ?? "");
      if (minutes !== null) break;
    }
    if (minutes === null) {
      skipped.push({ line, reason: "No duration (a timer that was still running?)" });
      return;
    }
    const whole = Math.round(minutes);
    if (whole < 1) {
      skipped.push({ line, reason: "Less than a minute" });
      return;
    }
    if (whole > 24 * 60) {
      skipped.push({ line, reason: "Longer than 24 hours" });
      return;
    }
    let note = (r[noteCol] ?? "").trim();
    if (note.length > NOTE_MAX) {
      note = note.slice(0, NOTE_MAX);
      truncatedNotes++;
    }
    rows.push({
      client: cap(clean(r[clientCol])) || DEFAULT_CLIENT,
      project: cap(clean(r[projectCol])) || DEFAULT_PROJECT,
      date,
      minutes: whole,
      note,
      billable: billableCol >= 0 ? parseBillable(r[billableCol]) : null,
      rateCents: rateCol >= 0 ? parseRate(r[rateCol]) : null,
    });
  });

  if (rows.length === 0) {
    const why = skipped[0]?.reason ? ` The first row said: ${skipped[0].reason}.` : "";
    return { ok: false, error: `I couldn't read any entries from that file.${why}` };
  }

  const dates = rows.map((x) => x.date).sort();
  const byProject = new Map<string, { client: string; project: string; entries: number; minutes: number }>();
  for (const x of rows) {
    const key = `${x.client}\u0000${x.project}`;
    const cur = byProject.get(key) ?? { client: x.client, project: x.project, entries: 0, minutes: 0 };
    cur.entries++;
    cur.minutes += x.minutes;
    byProject.set(key, cur);
  }
  return {
    ok: true,
    preview: {
      format,
      rows,
      skipped,
      dateOrder,
      dateOrderAmbiguous: ambiguous,
      dateSample: sample,
      truncatedNotes,
      totalMinutes: rows.reduce((n, x) => n + x.minutes, 0),
      from: dates[0],
      to: dates[dates.length - 1],
      clients: [...new Set(rows.map((x) => x.client))],
      projects: [...byProject.values()].sort((a, b) => b.minutes - a.minutes),
    },
  };
}
