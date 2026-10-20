"use client";

import { CircleAlert, CircleCheck } from "lucide-react";

import { useMoney } from "@/components/currency-provider";

/** Invoiced / Unpaid / Paid figures under the page title. */
export function InvoiceTotals({
  count,
  total,
  unpaid,
  filtering,
}: {
  count: number;
  total: number;
  unpaid: number;
  filtering: boolean;
}) {
  const money = useMoney();
  return (
    <dl className="grid grid-cols-3 gap-2 sm:gap-3">
      <div className="rounded-xl border bg-card px-3 py-3">
        <dt className="text-muted-foreground text-xs">
          Invoiced · {count} invoice{count === 1 ? "" : "s"}
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
}
