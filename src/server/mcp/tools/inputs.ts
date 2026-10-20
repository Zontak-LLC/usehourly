import { z } from "zod";

import { DATE_RE } from "@/lib/dates";

export const date = z.string().regex(DATE_RE, "Use YYYY-MM-DD").describe("Local calendar date, YYYY-MM-DD");
export const projectRef = z
  .string()
  .trim()
  .min(1)
  .describe('Project id, or "Client / Project" (just the project name works when it is unique)');
export const clientRef = z.string().trim().min(1).describe("Client id or exact client name");
export const noteText = z.string().trim().max(2000).describe("Description of the work (max 2,000 characters)");
export const minutesInt = z.number().int().min(1).max(1440).describe("Whole minutes, 1 to 1440");
export const durationText = z
  .string()
  .trim()
  .describe(
    'Free-form duration: "1.5", "1:30", "90m", "2h", "1h30". A bare number up to 12 means hours, larger means minutes',
  );
export const dollars = z
  .number()
  .min(0)
  .max(10_000)
  .describe("Amount per hour in the account's currency, e.g. 85 or 62.5");
export const invoiceRef = z.string().trim().min(1).describe("Invoice id or invoice number, e.g. INV-2026-004");
