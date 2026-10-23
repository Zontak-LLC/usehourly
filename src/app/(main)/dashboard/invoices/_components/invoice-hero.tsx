"use client";

import { formatMoney } from "@/lib/money";

/**
 * The money at a glance: three figures (paid with its share, unpaid, invoiced). The bar and legend that said the same
 * again were removed (issue 219); the tabs under it split waiting, overdue and paid.
 */
export function InvoiceHero({ currency, total, unpaid }: { currency: string; total: number; unpaid: number }) {
  const money = (cents: number) => formatMoney(cents, currency);
  const paid = total - unpaid;
  const percent = Math.round((paid / Math.max(1, total)) * 100);
  return (
    <section
      aria-label="Paid so far"
      data-headerless="a summary above the list"
      className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-sheet)]"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <dl className="grid gap-2 sm:grid-cols-3 sm:gap-4">
          {(
            [
              [`Paid · ${percent}%`, money(paid), ""], // ink: the teal dot and bar carry the colour
              ["Unpaid", money(unpaid), ""],
              ["Of", money(total), ""],
            ] as const
          ).map(([label, value, tone]) => (
            <div
              key={label}
              className="flex min-w-0 flex-col border-t-2 pt-2 max-sm:flex-row max-sm:items-baseline max-sm:justify-between max-sm:gap-3"
              style={{ borderTopColor: "color-mix(in oklab, var(--foreground) 18%, transparent)" }}
            >
              <dd
                className={`order-1 font-display font-extrabold text-xl tabular-nums max-sm:order-2 sm:text-3xl ${tone}`}
              >
                {value}
              </dd>
              <dt className="order-2 mt-1 font-mono text-[11px] text-foreground/75 uppercase tracking-widest max-sm:order-1 max-sm:mt-0">
                {label === "Of" ? "Invoiced" : label}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
