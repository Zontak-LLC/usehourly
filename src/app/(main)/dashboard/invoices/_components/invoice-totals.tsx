"use client";

import { CircleAlert, CircleCheck } from "lucide-react";

import { type CurrencyTotals, formatMoney } from "@/lib/money";

/** Invoiced / Unpaid / Paid figures under the page title: one set per currency, never added across currencies. */
export function InvoiceTotals({ groups, filtering }: { groups: CurrencyTotals[]; filtering: boolean }) {
  const several = groups.length > 1;
  return (
    <div className="flex flex-col gap-2 sm:gap-3">
      {groups.map(({ currency, count, total, unpaid }) => {
        const money = (cents: number) => formatMoney(cents, currency);
        return (
          <dl
            key={currency}
            aria-label={several ? `Totals in ${currency}` : undefined}
            className="grid grid-cols-3 gap-2 sm:gap-3"
          >
            <div className="rounded-xl border bg-card px-3 py-3">
              <dt className="text-muted-foreground text-xs">
                Invoiced{several ? ` in ${currency}` : ""} · {count} invoice{count === 1 ? "" : "s"}
                {filtering ? " (filtered)" : ""}
              </dt>
              <dd className="font-mono font-semibold text-base tabular-nums sm:text-xl">{money(total)}</dd>
            </div>
            <div className="rounded-xl border bg-card px-3 py-3">
              <dt className="flex items-center gap-1 text-muted-foreground text-xs">
                {unpaid > 0 && <CircleAlert aria-hidden className="size-3.5 text-destructive" />} Unpaid
              </dt>
              <dd className="font-mono font-semibold text-base tabular-nums sm:text-xl">{money(unpaid)}</dd>
            </div>
            <div className="rounded-xl border bg-card px-3 py-3">
              <dt className="flex items-center gap-1 text-muted-foreground text-xs">
                <CircleCheck aria-hidden className="size-3.5 text-success" /> Paid
              </dt>
              <dd className="font-mono font-semibold text-base text-success tabular-nums sm:text-xl">
                {money(total - unpaid)}
              </dd>
            </div>
          </dl>
        );
      })}
    </div>
  );
}
