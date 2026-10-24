"use client";

import { useState } from "react";

import { toISODate } from "@/lib/dates";
import { trpc } from "@/lib/trpc";

/**
 * The time not invoiced yet, per client, with the invoice due under each client's schedule (issue 100). Every screen
 * asks with the same input (the browser's today, fixed for the visit), so they share one cached answer.
 */
export function useUnbilled() {
  const [today] = useState(() => toISODate(new Date()));
  return trpc.invoice.unbilled.useQuery({ today });
}
