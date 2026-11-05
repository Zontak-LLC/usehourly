"use client";

import { useRouter } from "next/navigation";

import { Lock } from "lucide-react";
import { toast } from "sonner";

import { SectionCard } from "@/components/section-card";
import { NativeSelect } from "@/components/ui/native-select";
import { feature } from "@/lib/features";
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
        // Only what this release has: the per-client currency and budgets are switched off (issue 219).
        locked
          ? `Your currency is fixed because you have made an invoice.${
              feature("clientCurrency")
                ? " A client can still be billed in another currency: see Billing details on Clients."
                : ""
            }`
          : `Your currency, used for rates, invoices and totals. You can change it until you make your first invoice.${
              feature("clientCurrency") ? " Any client can be billed in a different one under Billing details." : ""
            }`
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* A fixed currency is plain text with a lock, not a greyed-out drop-down that still looks clickable. */}
        {locked ? (
          <p className="inline-flex items-center gap-1.5 font-medium">
            <Lock aria-hidden className="size-4 text-foreground/60" />
            {me.currency} · {CURRENCIES.find((c) => c.code === me.currency)?.name ?? me.currency} (
            {currencySymbol(me.currency)})
          </p>
        ) : (
          <>
            <label className="sr-only" htmlFor="currency-select">
              Currency
            </label>
            <NativeSelect
              id="currency-select"
              value={me.currency}
              disabled={setCurrency.isPending}
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
            </NativeSelect>
            <p className="text-muted-foreground text-sm">Example: {formatMoney(123456, me.currency)}</p>
          </>
        )}
      </div>
      {!locked && (
        <p className="text-muted-foreground text-xs">
          Changing it changes the symbol only: your rates keep their numbers, nothing is converted.
        </p>
      )}
    </SectionCard>
  );
}
