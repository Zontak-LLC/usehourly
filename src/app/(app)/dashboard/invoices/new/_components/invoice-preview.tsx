"use client";

import { useId, useState } from "react";

import Link from "next/link";

import { toast } from "sonner";

import { useCurrency, useMoney } from "@/components/currency-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDecimalHours } from "@/lib/duration";
import { feature } from "@/lib/features";
import type { buildInvoice } from "@/lib/invoice";
import { currencySymbol, rateCents } from "@/lib/money";
import { describeRounding, isRounding, type Rounding } from "@/lib/rounding";
import { formatTaxRate, type InvoiceTax, type TaxSetting, taxLabel, taxRowLabel } from "@/lib/tax";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

export type InvoiceTotals = ReturnType<typeof buildInvoice>;

export function InvoicePreviewCard({
  validRange,
  loading,
  error,
  totals,
  clientName,
  tax = null,
}: {
  validRange: boolean;
  loading: boolean;
  error: string | null;
  totals: InvoiceTotals;
  clientName: string | undefined;
  /** The tax the invoice will add on top of the lines (the same rule the server applies), or null. */
  tax?: InvoiceTax | null;
}) {
  const money = useMoney();
  // The exact total at once: a money figure that rolls passes through wrong amounts (drawing audit, 2026-10-23).
  const total = totals.totalCents + (tax?.cents ?? 0);
  return (
    // A sheet of paper: it settles onto the page; its total is shown exact at once.
    <div className="overflow-hidden rounded-md border bg-card shadow-[var(--shadow-sheet)] motion-safe:animate-[settle_.7s_cubic-bezier(.2,.8,.2,1)]">
      <h2 className="border-b bg-band-2 px-4 py-3 font-semibold text-base">Preview</h2>
      {!validRange ? (
        <p className="px-4 py-8 text-center text-muted-foreground text-sm">
          The start date must be on or before the end date.
        </p>
      ) : loading ? (
        <Skeleton className="m-4 h-24" />
      ) : error ? (
        <p className="px-4 py-6 text-destructive text-sm">Couldn't load time: {error}</p>
      ) : totals.lines.length === 0 ? (
        <p className="px-4 py-8 text-center text-muted-foreground text-sm">
          No billable time for {clientName} in this period.
          {/* A running timer has its own notice and choice below; with none, say where time comes from (issue 431). */}
          {totals.runningTimers === 0 && (
            <>
              {" "}
              Log time on{" "}
              <Link href="/dashboard/today" className="inline-block py-1 font-medium text-foreground underline">
                Today
              </Link>
              , or pick another period.
            </>
          )}
        </p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {totals.lines.map((l) => (
              <tr key={l.projectId} className="border-b">
                <td className="px-4 py-2">{l.project}</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground tabular-nums">
                  {formatDecimalHours(l.minutes)} h × {money(l.rateCents)}
                </td>
                <td className="px-4 py-2 text-right font-medium font-mono tabular-nums">{money(l.amountCents)}</td>
              </tr>
            ))}
            {tax && (
              <>
                <tr className="border-b">
                  <td className="px-4 py-2">Subtotal</td>
                  <td />
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{money(totals.totalCents)}</td>
                </tr>
                <tr className="border-b">
                  <td className="px-4 py-2">{taxRowLabel(tax)}</td>
                  <td />
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{money(tax.cents)}</td>
                </tr>
              </>
            )}
            <tr className="bg-muted/40 font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">
                {formatDecimalHours(totals.totalMinutes)} h
              </td>
              <td className="px-4 py-3 text-right font-display font-extrabold text-xl tabular-nums">{money(total)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export function InvoiceNotices({
  totals,
  rounding,
  nothingToBill,
}: {
  totals: InvoiceTotals;
  rounding: Rounding;
  nothingToBill: boolean;
}) {
  const money = useMoney();
  return (
    <>
      {isRounding(rounding) && totals.lines.length > 0 && (
        <p className="text-muted-foreground text-sm">
          {describeRounding(rounding)} You logged {formatDecimalHours(totals.loggedMinutes)} h and will bill{" "}
          {formatDecimalHours(totals.totalMinutes)} h.
          {/* A rule stored earlier still applies; the setting itself is hidden while rounding is turned off. */}
          {feature("rounding") && (
            <>
              {" "}
              Change it under{" "}
              <Link href="/dashboard/clients" className="underline">
                Clients
              </Link>
              .
            </>
          )}
        </p>
      )}

      {(totals.zeroRateProjects.length > 0 || totals.runningTimers > 0 || totals.skippedMinutes > 0) && (
        <ul className="flex flex-col gap-1 text-muted-foreground text-sm">
          {totals.zeroRateProjects.length > 0 && (
            <li className="flex flex-col gap-2">
              <span>
                ⚠ No hourly rate set for {totals.zeroRateProjects.map((p) => p.name).join(", ")} — billed at {money(0)}.
                Set it here or under{" "}
                <Link href="/dashboard/clients" className="underline">
                  Clients
                </Link>
                .
              </span>
              {totals.zeroRateProjects.map((p) => (
                <SetRate key={p.id} project={p} />
              ))}
            </li>
          )}
          {totals.runningTimers > 0 && (
            <li>⚠ A timer is running. Its time is not on this invoice until you stop it.</li>
          )}
          {totals.skippedMinutes > 0 && (
            <li>{formatDecimalHours(totals.skippedMinutes)} h on non-billable projects is left off.</li>
          )}
        </ul>
      )}

      {nothingToBill && (
        <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
          Every project in this period has a {money(0)} rate, so this invoice would be {money(0)}. Set the hourly rates
          under{" "}
          <Link href="/dashboard/clients" className="font-medium underline">
            Clients
          </Link>{" "}
          first, then come back, or set it here.
        </p>
      )}
    </>
  );
}

/**
 * "General · Rate per hour [ ] Save" under the $0 warning (issue 431: testers' first invoice came out at $0 and the way
 * out was another page). Saves through `project.update`, as the Clients edit form does; the preview re-prices from the
 * refetched entries, so the row goes away once the rate is set. It sits inside the invoice form, so it is not a form of
 * its own: Save is a plain button and Enter in the box saves the rate, never the invoice.
 */
function SetRate({ project }: { project: { id: string; name: string } }) {
  const currency = useCurrency();
  const money = useMoney();
  const utils = trpc.useUtils();
  const update = trpc.project.update.useMutation();
  const [rate, setRate] = useState("");
  const id = useId();

  async function save() {
    const hourlyRate = rateCents(rate);
    if (hourlyRate === 0) return toast.error("Type the hourly rate, like 60.");
    try {
      await update.mutateAsync({ id: project.id, hourlyRate });
      // Clients and the unbilled figures use the rate too; the invoice preview needs the entries again.
      await Promise.all([
        utils.entry.list.invalidate(),
        utils.clients.list.invalidate(),
        utils.invoice.unbilled.invalidate(),
      ]);
      toast.success(`${project.name} is now ${money(hourlyRate)}/h.`);
    } catch (err) {
      toastError(err, "Couldn't save that rate.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pl-5 text-foreground">
      <span className="font-medium">{project.name}</span>
      <span aria-hidden>·</span>
      <label htmlFor={id}>Rate per hour</label>
      <span className="text-muted-foreground" aria-hidden>
        {currencySymbol(currency)}
      </span>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={rate}
        placeholder="0.00"
        onChange={(e) => setRate(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          void save();
        }}
        aria-label={`Rate per hour for ${project.name}`}
        className="h-9 w-28 font-mono"
      />
      <Button
        type="button"
        variant="outline"
        className="h-9"
        disabled={update.isPending}
        aria-label={`Save the rate for ${project.name}`}
        onClick={() => void save()}
      >
        {update.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

/** Add the account's tax to this invoice, or leave it off this once (a client who accounts for the tax itself). */
export function TaxChoice({
  tax,
  add,
  onAdd,
}: {
  tax: Pick<TaxSetting, "name"> & { rate: number };
  add: boolean;
  onAdd: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-9 items-center gap-2 text-sm">
      <input type="checkbox" checked={add} onChange={(e) => onAdd(e.target.checked)} className="size-4" />
      Add {taxLabel(tax.name)} ({formatTaxRate(tax.rate)})
    </label>
  );
}
