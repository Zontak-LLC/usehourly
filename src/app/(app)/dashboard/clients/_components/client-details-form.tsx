"use client";

import { useEffect, useState } from "react";

import { X } from "lucide-react";
import { toast } from "sonner";

import { useAccountCurrency } from "@/components/currency-provider";
import { ExampleInvoice } from "@/components/example-invoice";
import { GuideLink } from "@/components/guide-link";
import { LogoPicker } from "@/components/logo-picker";
import { StopSlider } from "@/components/stop-slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toISODate } from "@/lib/dates";
import { feature } from "@/lib/features";
import { type InvoiceEvery, isInvoiceEvery, scheduleHint, scheduleOf } from "@/lib/invoice-schedule";
import { fileToLogo } from "@/lib/logo";
import { CURRENCIES, type CurrencyCode, currencySymbol, isCurrency } from "@/lib/money";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** Uncontrolled selects: their values are read from the form's FormData on save. */
function RoundingFields({ step, mode, min }: { step: number; mode: string; min: number }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="flex items-center gap-1 font-medium text-sm">
        Round the time on invoices <GuideLink topic="invoice-rounding" label="rounding time on invoices" />
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

/**
 * How often this client is invoiced (issue 100): when I choose, every month, or every 2 weeks from a start date. With a
 * schedule, Invoices and the client's bill bar say when an invoice is due. Nothing is sent by UseHourly.
 */
function ScheduleField({ every, anchor }: { every: string | null; anchor: string | null }) {
  const [today] = useState(() => toISODate(new Date()));
  const [choice, setChoice] = useState<InvoiceEvery | "">(isInvoiceEvery(every) ? every : "");
  const [start, setStart] = useState(anchor ?? today);
  const schedule = choice ? scheduleOf({ invoice_every: choice, invoice_anchor: start }) : null;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="client-invoice-every">Invoice this client</Label>
      <div className="flex flex-wrap gap-2">
        <NativeSelect
          id="client-invoice-every"
          name="invoiceEvery"
          value={choice}
          onChange={(e) => setChoice(isInvoiceEvery(e.target.value) ? e.target.value : "")}
          className="max-w-56"
        >
          <option value="">When I choose</option>
          <option value="month">Every month</option>
          <option value="2weeks">Every 2 weeks</option>
        </NativeSelect>
        {choice === "2weeks" && (
          <Input
            type="date"
            name="invoiceAnchor"
            aria-label="First day of the first two weeks"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
            className="max-w-48"
          />
        )}
      </div>
      <p className="text-muted-foreground text-xs">{scheduleHint(schedule, today)}</p>
    </div>
  );
}

/** The schedule as the form sends it; a two-week schedule without a start date waits for one (the field is required). */
function scheduleFrom(fd: FormData) {
  const every = fd.get("invoiceEvery");
  if (!isInvoiceEvery(every)) return { every: null, anchor: null };
  return { every, anchor: every === "2weeks" ? String(fd.get("invoiceAnchor") ?? "") : null };
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

/**
 * Billing details for one client (2026-10-23 redo): a titled panel with a Close button, the fields on the left and, on
 * the right, the invoice's "Bill to" block as it will print, following the typing. On a phone the two stack.
 */
export function ClientDetailsForm({ id, onDone }: { id: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const client = trpc.clients.get.useQuery({ id });
  const update = trpc.clients.update.useMutation();
  const [logo, setLogo] = useState<string | null>(null);
  // The text fields are held here so the "On the invoice" preview follows the typing.
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [address, setAddress] = useState("");
  useEffect(() => setLogo(client.data?.logo ?? null), [client.data?.logo]);
  useEffect(() => {
    if (!client.data) return;
    setName(client.data.name);
    setLegalName(client.data.legal_name ?? "");
    setAddress(client.data.address ?? "");
  }, [client.data]);

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
        // The "To" address when you send an invoice from your own mail app (issue 227).
        email: String(fd.get("email") ?? "").trim(),
        schedule: scheduleFrom(fd),
        // A locked (or hidden) select sends nothing: leave the currency as it is.
        ...(fd.has("currency") ? { currency: currencyChoice(fd.get("currency")) } : {}),
        // Hidden rounding fields send nothing: the stored rule stays as it is.
        ...(fd.has("roundStep")
          ? {
              rounding: {
                step: Number(fd.get("roundStep")),
                mode: fd.get("roundMode") === "nearest" ? "nearest" : "up",
                min: Number(fd.get("roundMin")),
              },
            }
          : {}),
        logo,
      });
      await Promise.all([
        utils.clients.list.invalidate(),
        utils.clients.get.invalidate({ id }),
        utils.clients.logos.invalidate(),
        utils.invoice.unbilled.invalidate(), // the "invoice due" prompt follows the schedule
      ]);
      toast.success("Client updated.");
      onDone();
    } catch (err) {
      toastError(err, "Couldn't update that client.");
    }
  }

  const withCurrency = feature("clientCurrency");
  const withRounding = feature("rounding");
  if (client.isLoading) return <Skeleton className="m-4 h-32" />;
  if (client.error || !client.data) {
    return <p className="px-4 py-3 text-destructive text-sm">Couldn't load client: {client.error?.message}</p>;
  }
  const c = client.data;
  return (
    <form method="post" onSubmit={save} aria-label={`Billing details for ${c.name}`} className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-base">Billing details</h3>
          <p className="text-foreground/70 text-sm">How {c.name} appears on your invoices.</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-10 shrink-0"
          onClick={onDone}
          aria-label="Close"
        >
          <X />
        </Button>
      </header>

      {/* The fields on the left; on the right, the "Bill to" block exactly as an invoice will show it, live. */}
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`cn-${id}`}>Name in UseHourly</Label>
            <Input
              id={`cn-${id}`}
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`cf-${id}`}>Name on invoices</Label>
            <Input
              id={`cf-${id}`}
              name="legalName"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder={name || c.name}
              maxLength={150}
            />
            <p className="text-foreground/60 text-xs">Their full or company name. Leave empty to use the name above.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`ca-${id}`}>Address on invoices</Label>
            <Textarea
              id={`ca-${id}`}
              name="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder={"500 Market St\nSan Francisco, CA 94105"}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`ce-${id}`}>Email for invoices</Label>
            <Input
              id={`ce-${id}`}
              name="email"
              type="email"
              defaultValue={c.email ?? ""}
              placeholder="accounts@client.com"
              maxLength={254}
              autoComplete="off"
            />
          </div>
          <ScheduleField every={c.invoice_every} anchor={c.invoice_anchor} />
          {withCurrency && <CurrencyField value={c.currency} locked={c.currency_locked} />}
          {withRounding && <RoundingFields step={c.round_step} mode={c.round_mode} min={c.round_min} />}
          <div className="grid gap-1.5">
            <span className="font-medium text-sm">Logo on invoices</span>
            <LogoPicker value={logo} onPick={pickLogo} onRemove={() => setLogo(null)} name="client logo" />
          </div>
        </div>

        <div className="md:pt-6">
          <ExampleInvoice />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-foreground/10 border-t pt-4 max-sm:flex-col-reverse max-sm:items-stretch">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={update.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
