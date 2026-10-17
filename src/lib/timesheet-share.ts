import { z } from "zod";

import { buildSheet, type SheetEntry } from "./timesheet";

/**
 * Rules for the timesheet a freelancer sends a client for sign-off. Pure, so they are tested without a screen
 * or a database. The shared page shows hours only: no rates, no amounts, no account details beyond the name.
 */
export const SHARE_EXPIRY_DAYS = [7, 30, 90] as const;
export const DEFAULT_SHARE_EXPIRY_DAYS = 30;
/** Live links one account may have at once. */
export const MAX_LIVE_SHARES = 50;
/** Expired links are deleted this long after they stop working. */
export const SHARE_KEEP_AFTER_EXPIRY_DAYS = 90;
export const MAX_SNAPSHOT_CHARS = 400_000;
export const MAX_APPROVER_NAME = 80;
export const MAX_APPROVER_NOTE = 500;

export type ShareSnapshot = {
  version: 1;
  owner: string;
  title: string;
  from: string;
  to: string;
  /** Days that have time, oldest first. */
  days: string[];
  rows: { client: string; project: string; minutes: number[]; total: number }[];
  dayTotals: number[];
  total: number;
  /** Entry notes, only when the freelancer chose to include them. */
  notes: { date: string; client: string; project: string; minutes: number; note: string }[] | null;
};

/** Entries the sheet leaves out: a timer still running, and zero-minute rows. */
const counts = (e: SheetEntry) => e.minutes > 0 && !e.started_at;

export function buildShareSnapshot(opts: {
  owner: string;
  title: string;
  from: string;
  to: string;
  entries: SheetEntry[];
  includeNotes: boolean;
}): ShareSnapshot {
  const entries = opts.entries.filter(counts);
  const sheet = buildSheet(entries);
  const days = Object.keys(sheet.dayTotals).sort();
  return {
    version: 1,
    owner: opts.owner,
    title: opts.title,
    from: opts.from,
    to: opts.to,
    days,
    rows: sheet.rows.map((r) => ({
      client: r.client,
      project: r.project,
      minutes: days.map((d) => r.cells[d]?.minutes ?? 0),
      total: r.total,
    })),
    dayTotals: days.map((d) => sheet.dayTotals[d] ?? 0),
    total: sheet.total,
    notes: opts.includeNotes
      ? entries
          .filter((e) => e.note.trim() !== "")
          .sort((a, b) => a.date.localeCompare(b.date) || a.project.name.localeCompare(b.project.name))
          .map((e) => ({
            date: e.date,
            client: e.project.client.name,
            project: e.project.name,
            minutes: e.minutes,
            note: e.note.trim(),
          }))
      : null,
  };
}

const snapshotSchema = z.object({
  version: z.literal(1),
  owner: z.string(),
  title: z.string(),
  from: z.string(),
  to: z.string(),
  days: z.array(z.string()),
  rows: z.array(z.object({ client: z.string(), project: z.string(), minutes: z.array(z.number()), total: z.number() })),
  dayTotals: z.array(z.number()),
  total: z.number(),
  notes: z
    .array(
      z.object({ date: z.string(), client: z.string(), project: z.string(), minutes: z.number(), note: z.string() }),
    )
    .nullable(),
});

/** The stored JSON as a snapshot, or null if it is not one (never throws). */
export function parseSnapshot(json: string): ShareSnapshot | null {
  try {
    const parsed = snapshotSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type ShareStatus = "approved" | "revoked" | "expired" | "waiting";

/** What a link is doing right now. Approved wins, so an approved sheet still reads as approved after it expires. */
export function shareStatus(
  row: { revoked_at: number | null; approved_at: number | null; expires_at: number },
  nowSeconds: number,
): ShareStatus {
  if (row.approved_at !== null) return "approved";
  if (row.revoked_at !== null) return "revoked";
  if (row.expires_at <= nowSeconds) return "expired";
  return "waiting";
}

export const approvalSchema = z.object({
  name: z.string().trim().min(1, "Please type your name.").max(MAX_APPROVER_NAME),
  note: z.string().trim().max(MAX_APPROVER_NOTE).optional(),
});
