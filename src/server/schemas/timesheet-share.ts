import { z } from "zod";

import { MAX_APPROVER_NAME, MAX_APPROVER_NOTE, type ShareSnapshot } from "@/lib/timesheet-share";

/** Server only: the sign-off panel imports lib/timesheet-share, so zod must stay out of it (issue 425). */
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

/** A client's sign-off of a shared timesheet: their name (required) and an optional note, for request inputs. */
export const approvalSchema = z.object({
  name: z.string().trim().min(1, "Please type your name.").max(MAX_APPROVER_NAME),
  note: z.string().trim().max(MAX_APPROVER_NOTE).optional(),
});
