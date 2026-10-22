"use client";

import { INVOICE_COLORS } from "@/lib/invoice-colors";
import { type CurrencyTotals, formatMoney } from "@/lib/money";

/** One small chip: a coloured dot, the amount, and what it is. */
function Chip({ colour, value, label }: { colour: string; value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-2 rounded-full bg-background/70 py-1 pr-3 pl-2.5 ring-1 ring-foreground/10">
      <span aria-hidden className="size-2 self-center rounded-full" style={{ background: colour }} />
      <span className="font-bold font-display text-base text-foreground tabular-nums">{value}</span>
      <span className="font-mono text-[11px] text-foreground/75 uppercase tracking-widest">{label}</span>
    </span>
  );
}

/**
 * Invoiced / unpaid / paid as three small chips (a coloured dot, the amount, the word), after a count line.
 * One row per currency, never added across currencies.
 */
export function InvoiceTotals({ groups, filtering }: { groups: CurrencyTotals[]; filtering: boolean }) {
  return (
    <div className="mt-1 flex flex-col gap-2">
      {groups.map(({ currency, count, total, unpaid }) => {
        const money = (cents: number) => formatMoney(cents, currency);
        return (
          <div key={currency} className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-foreground/75 text-sm">
              {count} invoice{count === 1 ? "" : "s"}
              {filtering ? " (filtered)" : ""}
            </span>
            <Chip colour="var(--amber)" value={money(total)} label="invoiced" />
            <Chip colour={INVOICE_COLORS.waiting} value={money(unpaid)} label="unpaid" />
            <Chip colour={INVOICE_COLORS.paid} value={money(total - unpaid)} label="paid" />
          </div>
        );
      })}
    </div>
  );
}
