"use client";

import { type CurrencyTotals, formatMoney } from "@/lib/money";

/**
 * Invoiced / unpaid / paid as ONE line of words (no tiles): "$2,347.50 invoiced · $1,155.00 unpaid · $1,192.50 paid".
 * One line per currency, never added across currencies.
 */
export function InvoiceTotals({ groups, filtering }: { groups: CurrencyTotals[]; filtering: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 text-foreground/75 text-sm">
      {groups.map(({ currency, count, total, unpaid }) => {
        const money = (cents: number) => formatMoney(cents, currency);
        return (
          <p key={currency}>
            {count} invoice{count === 1 ? "" : "s"}
            {filtering ? " (filtered)" : ""} · <span className="font-medium text-foreground">{money(total)}</span>{" "}
            invoiced · <span className="font-bold font-display text-base text-foreground">{money(unpaid)}</span> unpaid
            · <span className="font-bold font-display text-base text-success">{money(total - unpaid)}</span> paid
          </p>
        );
      })}
    </div>
  );
}
