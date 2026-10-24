"use client";

import Link from "next/link";

import { useAccountCurrency } from "@/components/currency-provider";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/duration";
import { dueTitle, invoiceBuilderHref } from "@/lib/invoice-schedule";
import { effectiveCurrency, formatMoney } from "@/lib/money";
import type { Unbilled } from "@/lib/unbilled";

/**
 * The calm "invoice due" prompt at the top of Invoices (issue 100): one line per client on an invoice schedule whose
 * period is over and not billed yet, "October invoice for Acme is due · 12:30 h · $1,187.50", with Make invoice opening
 * the builder on that period. It goes away by itself once an invoice covers the period. Nothing is sent or stored.
 */
export function InvoicesDue({
  unbilled,
  clients,
  today,
}: {
  unbilled: Unbilled[] | undefined;
  clients: { id: string; name: string; currency: string | null }[] | undefined;
  today: string | null;
}) {
  const account = useAccountCurrency();
  if (!today || !unbilled || !clients) return null;
  const due = unbilled.flatMap((u) => {
    const client = clients.find((c) => c.id === u.clientId);
    return u.due && client ? [{ client, due: u.due }] : [];
  });
  if (due.length === 0) return null;
  return (
    <section
      aria-label="Invoices due"
      className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-sheet)]"
    >
      <ul>
        {due.map(({ client, due: d }, n) => (
          <li
            key={client.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 not-first:border-t sm:px-4"
            data-testid="invoice-due"
          >
            <p className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{dueTitle(d, today, client.name)}</span>
              <span className="text-foreground/70 text-sm tabular-nums">
                {formatDuration(d.minutes)} h · {formatMoney(d.cents, effectiveCurrency(client.currency, account))}
              </span>
            </p>
            {/* One solid button per screen: the first prompt carries it, any others are outlines. */}
            <Button asChild variant={n === 0 ? "primary" : "outline"} className="h-10 px-4 max-sm:w-full">
              <Link href={invoiceBuilderHref(client.id, d)} aria-label={`Make the invoice for ${client.name}`}>
                Make invoice
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
