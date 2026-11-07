/**
 * Plain CSV writing, shared by the exports. Its own small file (issue 425): Week and Month use it for their CSV
 * download, and taking it from `export-all.ts` put the whole "Download everything" zip code in their first load.
 */

/**
 * RFC 4180 field: quoted when it holds a comma, quote or line break; quotes doubled.
 *
 * A text value that starts with = + - @ (or a tab or carriage return) would be run as a formula
 * when the file is opened in Excel or Sheets, so it gets a leading apostrophe. Numbers are exempt.
 */
function csvField(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  // The BOM makes Excel read the file as UTF-8, so names like "Café" survive.
  return `﻿${rows.map((r) => r.map(csvField).join(",")).join("\r\n")}\r\n`;
}

/** The CSV twin of an Excel download's name: `usehourly-2026-10.xlsx` → `usehourly-2026-10.csv`. */
export function csvFilename(filename: string): string {
  return filename.replace(/\.xlsx$/, ".csv");
}
