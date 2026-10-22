"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { useAccountCurrency } from "@/components/currency-provider";
import { FormStep } from "@/components/form-step";
import { GuideLink } from "@/components/guide-link";
import { LogoPicker } from "@/components/logo-picker";
import { StopSlider } from "@/components/stop-slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { fileToLogo } from "@/lib/logo";
import { CURRENCIES, type CurrencyCode, currencySymbol, isCurrency } from "@/lib/money";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** Uncontrolled selects: their values are read from the form's FormData on save. */
function RoundingFields({ step, mode, min }: { step: number; mode: string; min: number }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="flex items-center gap-1 font-medium text-sm">
        Round the time on invoices <GuideLink topic="rounding" label="rounding time on invoices" />
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <span className="text-sm">Round to</span>
          <StopSlider
            name="roundStep"
            label="Round to"
            defaultValue={step}
            options={[
              { value: 0, label: "Off" },
              { value: 6, label: "6 min" },
              { value: 15, label: "15 min" },
              { value: 30, label: "30 min" },
            ]}
          />
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm">At least, per entry</span>
          <StopSlider
            name="roundMin"
            label="Minimum per entry"
            defaultValue={min}
            options={[
              { value: 0, label: "None" },
              { value: 15, label: "15 min" },
              { value: 30, label: "30 min" },
              { value: 60, label: "1 h" },
            ]}
          />
        </div>
        <NativeSelect
          name="roundMode"
          aria-label="Round up or to the nearest"
          defaultValue={mode}
          className="sm:max-w-56"
        >
          <option value="up">Round up</option>
          <option value="nearest">Round to the nearest</option>
        </NativeSelect>
      </div>
      <p className="text-muted-foreground text-xs">
        Applies when you make an invoice, entry by entry. Your logged time never changes, and the invoice says what was
        rounded.
      </p>
    </fieldset>
  );
}

const currencyChoice = (value: FormDataEntryValue | null): CurrencyCode | null => (isCurrency(value) ? value : null);

/** The client's billing currency: "same as the account" or one of the supported ones. Fixed once it has an invoice. */
function CurrencyField({ value, locked }: { value: string | null; locked: boolean }) {
  const account = useAccountCurrency();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="client-currency" className="flex items-center gap-1">
        Currency
      </Label>
      <NativeSelect
        id="client-currency"
        name="currency"
        defaultValue={isCurrency(value) ? value : ""}
        disabled={locked}
        className="max-w-72"
      >
        <option value="">Same as my account ({account})</option>
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} · {c.name} ({currencySymbol(c.code)})
          </option>
        ))}
      </NativeSelect>
      <p className="text-muted-foreground text-xs">
        {locked
          ? "Fixed, because you have made an invoice for this client."
          : "The currency of this client's rates, budgets and invoices. Nothing is converted if you change it."}
      </p>
    </div>
  );
}

/** Name, billing address and logo for one client — what its invoices' "bill to" block shows. */
export function ClientDetailsForm({ id, onDone }: { id: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const client = trpc.clients.get.useQuery({ id });
  const update = trpc.clients.update.useMutation();
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => setLogo(client.data?.logo ?? null), [client.data?.logo]);

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setLogo(await fileToLogo(file));
    } catch (err) {
      toastError(err, "Couldn't use that image.");
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await update.mutateAsync({
        id,
        name: String(fd.get("name")),
        legalName: String(fd.get("legalName") ?? ""),
        address: String(fd.get("address") ?? ""),
        email: String(fd.get("email") ?? "").trim(),
        // A locked select is disabled and sends nothing: leave the currency as it is.
        ...(fd.has("currency") ? { currency: currencyChoice(fd.get("currency")) } : {}),
        rounding: {
          step: Number(fd.get("roundStep")),
          mode: fd.get("roundMode") === "nearest" ? "nearest" : "up",
          min: Number(fd.get("roundMin")),
        },
        logo,
      });
      await Promise.all([
        utils.clients.list.invalidate(),
        utils.clients.get.invalidate({ id }),
        utils.clients.logos.invalidate(),
      ]);
      toast.success("Client updated.");
      onDone();
    } catch (err) {
      toastError(err, "Couldn't update that client.");
    }
  }

  if (client.isLoading) return <Skeleton className="m-4 h-32" />;
  if (client.error || !client.data) {
    return <p className="px-4 py-3 text-destructive text-sm">Couldn't load client: {client.error?.message}</p>;
  }
  return (
    <form method="post" onSubmit={save} className="flex flex-col gap-6 px-2 py-3">
      <FormStep n={1} title="Who are they?">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid content-start gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`cn-${id}`}>Client name</Label>
              <Input id={`cn-${id}`} name="name" defaultValue={client.data.name} required maxLength={80} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`cf-${id}`}>Full name (shown on invoices)</Label>
              <Input
                id={`cf-${id}`}
                name="legalName"
                defaultValue={client.data.legal_name ?? ""}
                placeholder={client.data.name}
                maxLength={150}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`ce-${id}`}>Email (where you send invoices)</Label>
              <Input
                id={`ce-${id}`}
                name="email"
                type="email"
                defaultValue={client.data.email ?? ""}
                placeholder="accounts@client.com"
                maxLength={254}
                autoComplete="off"
              />
              <p className="text-muted-foreground text-xs">
                Kept private. Nothing is sent to it unless you send something.
              </p>
            </div>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor={`ca-${id}`}>Billing address (shown on invoices)</Label>
            <Textarea
              id={`ca-${id}`}
              name="address"
              defaultValue={client.data.address ?? ""}
              rows={6}
              maxLength={300}
              placeholder={"500 Market St\nSan Francisco, CA 94105"}
            />
          </div>
        </div>
      </FormStep>
      <FormStep n={2} title="How do you bill them?">
        <CurrencyField value={client.data.currency} locked={client.data.currency_locked} />
        <RoundingFields step={client.data.round_step} mode={client.data.round_mode} min={client.data.round_min} />
      </FormStep>
      <FormStep n={3} title="Their logo">
        <LogoPicker value={logo} onPick={pickLogo} onRemove={() => setLogo(null)} name="client logo" />
      </FormStep>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={update.isPending}>
          Save client
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
