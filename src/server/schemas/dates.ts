import { z } from "zod";

import { DATE_RE, isRealDate } from "@/lib/dates";

/** A real YYYY-MM-DD calendar date, for request inputs. Server only: zod stays out of the browser (issue 425). */
export const dateSchema = z
  .string()
  .regex(DATE_RE, "Use YYYY-MM-DD")
  .refine((s) => isRealDate(s), "That is not a real date.");
