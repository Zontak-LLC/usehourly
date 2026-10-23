"use client";

import { formatMoney } from "@/lib/money";
import { PALETTE } from "@/lib/palette";

import type { InvoiceRow } from "./invoice-types";

/** The money at a glance: three figures (paid with its share, unpaid, invoiced) and one bar split into paid, due soon and late. */
export function InvoiceHero({
  invoices,
  currency,
  total,
  unpaid,
  today,
}: {
  invoices: InvoiceRow[];
  currency: string;
  total: number;
  unpaid: number;
  today: string | null;
}) {
  const money = (cents: number) => formatMoney(cents, currency);
  const paid = total - unpaid;
  const late = today
    ? invoices
        .filter((i) => i.currency === currency && !i.paid_date && i.due_date && i.due_date < today)
        .reduce((sum, i) => sum + i.total_cents, 0)
    : 0;
  const soon = Math.max(0, unpaid - late);
  const share = (n: number) => `${(n / Math.max(1, total)) * 100}%`;
  const percent = Math.round((paid / Math.max(1, total)) * 100);
  return (
    <section
      aria-label="Paid so far"
      data-headerless="a summary above the list"
      className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-sheet)]"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <dl className="grid grid-cols-3 gap-4">
          {(
            [
              [`Paid · ${percent}%`, money(paid), "text-success"],
              ["Unpaid", money(unpaid), ""],
              ["Of", money(total), ""],
            ] as const
          ).map(([label, value, tone]) => (
            <div
              key={label}
              className="flex min-w-0 flex-col border-t-2 pt-2"
              style={{ borderTopColor: "color-mix(in oklab, var(--foreground) 18%, transparent)" }}
            >
              <dd className={`order-1 truncate font-display font-extrabold text-xl tabular-nums sm:text-3xl ${tone}`}>
                {value}
              </dd>
              <dt className="order-2 mt-1 font-mono text-[11px] text-foreground/75 uppercase tracking-widest">
                {label === "Of" ? "Invoiced" : label}
              </dt>
            </div>
          ))}
        </dl>
        <div>
          <div aria-hidden className="flex h-3 overflow-hidden rounded-full bg-muted">
            <span className="h-full" style={{ width: share(paid), background: PALETTE.money.paid }} />
            <span className="h-full" style={{ width: share(soon), background: PALETTE.money.waiting }} />
            <span className="h-full" style={{ width: share(late), background: PALETTE.money.late }} />
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-foreground/75">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: PALETTE.money.paid }} /> Paid
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: PALETTE.money.waiting }} /> Waiting{" "}
              {money(soon)}
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: PALETTE.money.late }} /> Late{" "}
              {money(late)}
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
