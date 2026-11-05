"use client";

import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { shortDay } from "@/lib/client-list";
import { formatDuration } from "@/lib/duration";
import { ROW_FIGURE } from "@/lib/figures";
import { formatMoney } from "@/lib/money";
import { count } from "@/lib/plural";
import { trpc } from "@/lib/trpc";

import { type InvoiceFact, invoiceStatus } from "./client-facts";
import type { ClientRow } from "./client-types";

/** The Time tab: this month's entries for the client, newest first (asked for only when the tab is opened). */
export function ProfileTime({
  client: c,
  month,
  today,
}: {
  client: ClientRow;
  month: { from: string; to: string };
  today: string | null;
}) {
  const entries = trpc.entry.list.useQuery(month);
  const mine = (entries.data ?? []).filter((e) => e.project.client_id === c.id);
  const total = mine.reduce((sum, e) => sum + e.minutes, 0);
  return (
    <div className="flex flex-col gap-2">
      <p className="px-3 text-foreground/70 text-sm">
        This month · {count(mine.length, "entry", "entries")} · {formatDuration(total)}
      </p>
      {entries.isLoading && <Skeleton className="h-24 w-full" />}
      {entries.data && mine.length === 0 && (
        <p className="px-3 py-3 text-foreground/70 text-sm">No time logged for {c.name} this month.</p>
      )}
      <ul className="empty:hidden">
        {mine.map((e) => (
          <li
            key={e.id}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 border-t px-3 py-2.5 text-sm first:border-t-0"
          >
            <span className="text-foreground/70">{shortDay(e.date, today)}</span>
            <span className="min-w-0">
              <span className="font-medium">{e.project.name}</span>
              {e.note && <span className="block truncate text-foreground/70">{e.note}</span>}
              {e.invoice_id && <span className="text-foreground/60 text-xs">Invoiced</span>}
            </span>
            <span className={ROW_FIGURE}>{formatDuration(e.minutes)}</span>
          </li>
        ))}
      </ul>
      <Link href="/dashboard/month" className="self-start px-3 py-2 text-sm underline underline-offset-4">
        Open this month
      </Link>
    </div>
  );
}

type InvoiceRow = InvoiceFact & { id: string; total_cents: number; currency: string };

/** The Invoices tab: the client's invoices (from the list the page already has), newest first, with their state in words. */
export function ProfileInvoices({
  client: c,
  invoices,
  today,
}: {
  client: ClientRow;
  invoices: readonly InvoiceRow[];
  today: string | null;
}) {
  const mine = invoices.filter((i) => i.client_id === c.id);
  return (
    <div className="flex flex-col gap-2">
      {mine.length === 0 && <p className="px-3 py-3 text-foreground/70 text-sm">No invoices for {c.name} yet.</p>}
      <ul className="empty:hidden">
        {mine.map((inv) => (
          <li
            key={inv.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-t px-3 py-2.5 text-sm first:border-t-0"
          >
            <span className="min-w-0">
              <span className="font-medium">{inv.number}</span>
              <span className="block text-foreground/70">
                Issued {shortDay(inv.issue_date, today)} · {statusWords(inv, today)}
              </span>
            </span>
            <span className={ROW_FIGURE}>{formatMoney(inv.total_cents, inv.currency)}</span>
          </li>
        ))}
      </ul>
      <Link href="/dashboard/invoices" className="self-start px-3 py-2 text-sm underline underline-offset-4">
        All invoices
      </Link>
    </div>
  );
}

function statusWords(inv: InvoiceFact, today: string | null): string {
  if (!today && !inv.paid_date) return "not paid yet";
  const s = invoiceStatus(inv, today ?? "");
  if (s.kind === "paid") return `paid ${shortDay(s.date, today)}`;
  if (s.kind === "late") return `${count(s.days, "day")} late`;
  if (s.kind === "due") return `due ${shortDay(s.date, today)}`;
  return "not paid yet";
}
