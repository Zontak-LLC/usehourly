/** Billing rounding rules (issue #36). Applied per entry when an invoice is built; stored entries never change. */
import { z } from "zod";

export const ROUND_STEPS = [0, 6, 15, 30] as const;
export const ROUND_MINIMUMS = [0, 15, 30, 60] as const;

export type Rounding = { step: number; mode: "up" | "nearest"; min: number };

export const NO_ROUNDING: Rounding = { step: 0, mode: "up", min: 0 };

export const roundingSchema = z.object({
  step: z
    .number()
    .int()
    .refine((n) => (ROUND_STEPS as readonly number[]).includes(n), "Choose 6, 15 or 30 minutes."),
  mode: z.enum(["up", "nearest"]),
  min: z.number().int().min(0).max(240),
});

export const isRounding = (r: Rounding) => r.step > 0 || r.min > 0;

/** Minutes billed for one entry. Zero stays zero (a timer just started bills nothing). */
export function billedMinutes(minutes: number, r: Rounding): number {
  if (minutes <= 0) return 0;
  let m = minutes;
  if (r.step > 0) {
    m = r.mode === "up" ? Math.ceil(m / r.step) * r.step : Math.round(m / r.step) * r.step;
  }
  return Math.max(m, r.min);
}

/** The rule in plain words, for the invoice and the preview. */
export function describeRounding(r: Rounding): string {
  const parts: string[] = [];
  if (r.step > 0) {
    parts.push(
      r.mode === "up"
        ? `Time is rounded up to the next ${r.step} minutes`
        : `Time is rounded to the nearest ${r.step} minutes`,
    );
  }
  if (r.min > 0) parts.push(`${parts.length ? "with" : "Time has"} a minimum of ${r.min} minutes per entry`);
  return `${parts.join(", ")}.`;
}
