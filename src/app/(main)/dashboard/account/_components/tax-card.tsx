"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/money";
import {
  formatTaxRate,
  MAX_TAX_NAME,
  MAX_TAX_NUMBER,
  parseTaxRate,
  TAX_NAMES,
  taxCents,
  taxLabel,
  taxRateInput,
} from "@/lib/tax";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import type { AccountMe } from "./account-section";

/**
 * Tax on invoices (issue #71 step 4): VAT, GST or sales tax added on top of each new invoice, and the tax number printed
 * on it. Each invoice can still leave the tax off when it is made; invoices already issued never change.
 */
export function TaxCard({ me }: { me: AccountMe }) {
  const utils = trpc.useUtils();
  const setTax = trpc.account.setTax.useMutation();
  const [name, setName] = useState(me.tax_name ?? "");
  const [rate, setRate] = useState(taxRateInput(me.tax_rate));
  const [number, setNumber] = useState(me.tax_number ?? "");
  useEffect(() => {
    setName(me.tax_name ?? "");
    setRate(taxRateInput(me.tax_rate));
    setNumber(me.tax_number ?? "");
  }, [me.tax_name, me.tax_rate, me.tax_number]);

  const parsed = parseTaxRate(rate);
  const error = "error" in parsed ? parsed.error : null;
  const bp = "rate" in parsed ? parsed.rate : 0;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (error) return;
    try {
      await setTax.mutateAsync({ name, rate: bp, number });
      await utils.account.me.invalidate();
      toast.success(
        bp > 0 ? `New invoices add ${taxLabel(name)} at ${formatTaxRate(bp)}.` : "New invoices add no tax.",
      );
    } catch (err) {
      toastError(err, "Couldn't save the tax.");
    }
  }

  return (
    <SectionCard
      onSubmit={save}
      title="Tax"
      description="VAT, GST or sales tax added on top of each new invoice. Leave the rate empty if you don't charge any."
    >
      <div className="grid gap-4 sm:max-w-md">
        <div className="grid gap-1.5">
          <Label htmlFor="tax-name">Name of the tax</Label>
          <Input
            id="tax-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            clearable
            placeholder="VAT"
            maxLength={MAX_TAX_NAME}
          />
          <div className="flex flex-wrap gap-2">
            {TAX_NAMES.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={name === n}
                onClick={() => setName(n)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  name === n ? "border-foreground bg-foreground text-background" : "bg-muted/50 hover:bg-muted"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tax-rate">Rate (%)</Label>
          <Input
            id="tax-rate"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            placeholder="20"
            aria-invalid={error ? true : undefined}
            aria-describedby="tax-rate-help"
            className="w-32 font-mono"
          />
          <p id="tax-rate-help" className={error ? "text-destructive text-sm" : "text-muted-foreground text-xs"}>
            {error ??
              (bp > 0
                ? `On ${formatMoney(100000, me.currency)} of work: ${taxLabel(name)} ${formatMoney(
                    taxCents(100000, bp),
                    me.currency,
                  )}, total ${formatMoney(100000 + taxCents(100000, bp), me.currency)}.`
                : "No tax is added to invoices.")}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tax-number">Your tax number</Label>
          <Input
            id="tax-number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            clearable
            placeholder="GB123456789"
            maxLength={MAX_TAX_NUMBER}
            className="font-mono"
          />
          <p className="text-muted-foreground text-xs">
            Printed on every invoice when filled in (your VAT or GST registration number).
          </p>
        </div>
        <Button type="submit" className="h-10 self-start px-5" disabled={setTax.isPending || !!error}>
          Save tax
        </Button>
      </div>
    </SectionCard>
  );
}
