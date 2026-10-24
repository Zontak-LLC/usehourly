import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Realistic exports from the three apps people move from (column names as each app writes them in 2026), read as the
 * browser's `file.text()` would: Toggl Track's detailed report (with a UTF-8 BOM and Windows line ends), Clockify's
 * detailed report (US dates that could be read either way) and Harvest's detailed time report (decimal hours).
 */
const read = (name: string) => readFileSync(join(import.meta.dirname, name), "utf8");

export const TOGGL_FILE = read("toggl-detailed.csv");
export const CLOCKIFY_FILE = read("clockify-detailed.csv");
export const HARVEST_FILE = read("harvest-time-report.csv");
