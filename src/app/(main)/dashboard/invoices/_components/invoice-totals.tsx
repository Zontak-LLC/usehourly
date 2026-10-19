"use client";

import { CircleAlert, CircleCheck } from "lucide-react";

import { formatMoney } from "@/lib/invoice";

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
  return (
    <dl className="grid grid-cols-3 gap-2 sm:gap-3">
      <div className="rounded-xl border bg-card px-3 py-2.5">
        <dt className="text-muted-foreground text-xs">
          Invoiced · {count} invoice{count === 1 ? "" : "s"}
          {filtering ? " (filtered)" : ""}
        </dt>
        <dd className="font-mono font-semibold text-base tabular-nums sm:text-xl">{formatMoney(total)}</dd>
      </div>
      <div className="rounded-xl border bg-card px-3 py-2.5">
        <dt className="flex items-center gap-1 text-muted-foreground text-xs">
          {unpaid > 0 && <CircleAlert aria-hidden className="size-3.5 text-destructive" />} Unpaid
        </dt>
        <dd className="font-mono font-semibold text-base tabular-nums sm:text-xl">{formatMoney(unpaid)}</dd>
      </div>
      <div className="rounded-xl border bg-card px-3 py-2.5">
        <dt className="flex items-center gap-1 text-muted-foreground text-xs">
          <CircleCheck aria-hidden className="size-3.5 text-success" /> Paid
        </dt>
        <dd className="font-mono font-semibold text-base text-success tabular-nums sm:text-xl">
          {formatMoney(total - unpaid)}
        </dd>
      </div>
    </dl>
  );
}
