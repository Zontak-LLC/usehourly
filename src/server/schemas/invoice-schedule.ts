import { z } from "zod";

import { INVOICE_EVERY } from "@/lib/invoice-schedule";

import { dateSchema } from "./dates";

/** What `clients.update` takes: null = "when I choose"; every 2 weeks needs the first day of the first period. */
export const invoiceScheduleSchema = z
  .object({ every: z.enum(INVOICE_EVERY).nullable(), anchor: dateSchema.nullable() })
  .refine((v) => v.every !== "2weeks" || v.anchor !== null, {
    message: "Choose the first day of the first two weeks.",
    path: ["anchor"],
  });
