"use client";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { SectionCard } from "@/components/section-card";
import { CURRENCIES, type CurrencyCode, currencySymbol, formatMoney } from "@/lib/money";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import type { AccountMe } from "./account-section";

/** The account's currency: how rates, budgets, invoices and totals are written. Fixed once an invoice exists. */
export function CurrencyCard({ me }: { me: AccountMe }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const setCurrency = trpc.account.setCurrency.useMutation();
  const locked = me.currency_locked;

  return (
    <SectionCard
      title="Currency"
      description={
        locked
          ? "Your currency is fixed because you have made an invoice. A client can still be billed in another currency: see Billing details on Clients & Projects."
          : "Your usual currency, used for rates, budgets, invoices and totals. You can change it until you make your first invoice, and any client can be billed in a different one under Billing details."
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="currency-select">
          Currency
        </label>
        <select
          id="currency-select"
          value={me.currency}
          disabled={locked || setCurrency.isPending}
          className="h-10 rounded-lg border border-input bg-card px-2 text-sm dark:bg-input/30"
          onChange={async (e) => {
            try {
              const { currency } = await setCurrency.mutateAsync({ currency: e.target.value as CurrencyCode });
              await utils.account.me.invalidate();
              router.refresh(); // the layout reads the currency on the server, so the rest of the app follows
              toast.success(`Amounts are now written like ${formatMoney(123456, currency)}.`);
            } catch (err) {
              toastError(err, "Couldn't change the currency.");
            }
          }}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · {c.name} ({currencySymbol(c.code)})
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-sm">Example: {formatMoney(123456, me.currency)}</p>
      </div>
      {!locked && (
        <p className="text-muted-foreground text-xs">
          Changing it changes the symbol only: your rates and budgets keep their numbers, nothing is converted.
        </p>
      )}
    </SectionCard>
  );
}
