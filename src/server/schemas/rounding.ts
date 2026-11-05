import { z } from "zod";

import { ROUND_STEPS } from "@/lib/rounding";

/** A client's billing rounding rule, for request inputs. Server only: zod stays out of the browser (issue 425). */
export const roundingSchema = z.object({
  step: z
    .number()
    .int()
    .refine((n) => (ROUND_STEPS as readonly number[]).includes(n), "Choose 6, 15 or 30 minutes."),
  mode: z.enum(["up", "nearest"]),
  min: z.number().int().min(0).max(240),
});
