import { TRPCError } from "@trpc/server";

import type { Caller } from "./core";
import { hours, round2 } from "./format";

// A snapshot carries the seller's and client's logos (hundreds of KB each); the model never needs them.
export function stripLogos<T extends { seller?: { logo?: unknown }; client?: { logo?: unknown } }>(snapshot: T): T {
  const copy = JSON.parse(JSON.stringify(snapshot)) as T;
  if (copy.seller && "logo" in copy.seller) copy.seller.logo = copy.seller.logo ? "[logo]" : null;
  if (copy.client && "logo" in copy.client) copy.client.logo = copy.client.logo ? "[logo]" : null;
  return copy;
}

export function shapeInvoiceSummary(i: {
  id: string;
  client_name: string;
  number: string;
  issue_date: string;
  due_date: string | null;
  paid_date: string | null;
  period_from: string;
  period_to: string;
  total_minutes: number;
  total_cents: number;
  notes: string;
}) {
  return {
    id: i.id,
    number: i.number,
    client: i.client_name,
    issue_date: i.issue_date,
    due_date: i.due_date,
    paid_date: i.paid_date,
    status: i.paid_date ? "paid" : "unpaid",
    period_from: i.period_from,
    period_to: i.period_to,
    hours: hours(i.total_minutes),
    total: round2(i.total_cents / 100),
    total_cents: i.total_cents,
    notes: i.notes,
  };
}

export async function findInvoiceId(c: Caller, ref: string): Promise<string> {
  // Ids are uuids; anything else is treated as an invoice number such as INV-2026-004.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) return ref;
  const rows = await c.invoice.list({ q: ref });
  const hit = rows.find((r) => r.number.toLowerCase() === ref.toLowerCase());
  if (!hit) throw new TRPCError({ code: "NOT_FOUND", message: `No invoice numbered "${ref}".` });
  return hit.id;
}
