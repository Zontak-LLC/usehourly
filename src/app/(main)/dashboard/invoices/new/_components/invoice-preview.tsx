"use client";

import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { formatDecimalHours } from "@/lib/duration";
import { type buildInvoice, formatMoney } from "@/lib/invoice";
import { describeRounding, isRounding, type Rounding } from "@/lib/rounding";

export type InvoiceTotals = ReturnType<typeof buildInvoice>;

export function InvoicePreviewCard({
  validRange,
  loading,
  error,
  totals,
  clientName,
}: {
  validRange: boolean;
  loading: boolean;
  error: string | null;
  totals: InvoiceTotals;
  clientName: string | undefined;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
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
        </p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {totals.lines.map((l) => (
              <tr key={l.projectId} className="border-b">
                <td className="px-4 py-2">{l.project}</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground tabular-nums">
                  {formatDecimalHours(l.minutes)} h × {formatMoney(l.rateCents)}
                </td>
                <td className="px-4 py-2 text-right font-medium font-mono tabular-nums">
                  {formatMoney(l.amountCents)}
                </td>
              </tr>
            ))}
            <tr className="bg-muted/40 font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">
                {formatDecimalHours(totals.totalMinutes)} h
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(totals.totalCents)}</td>
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
  return (
    <>
      {isRounding(rounding) && totals.lines.length > 0 && (
        <p className="text-muted-foreground text-sm">
          {describeRounding(rounding)} You logged {formatDecimalHours(totals.loggedMinutes)} h and will bill{" "}
          {formatDecimalHours(totals.totalMinutes)} h. Change it under{" "}
          <Link href="/dashboard/clients" className="underline">
            Clients & Projects
          </Link>
          .
        </p>
      )}

      {(totals.zeroRateProjects.length > 0 || totals.runningTimers > 0 || totals.skippedMinutes > 0) && (
        <ul className="flex flex-col gap-1 text-muted-foreground text-sm">
          {totals.zeroRateProjects.length > 0 && (
            <li>
              ⚠ No hourly rate set for {totals.zeroRateProjects.join(", ")} — billed at $0.00. Set it under{" "}
              <Link href="/dashboard/clients" className="underline">
                Clients & Projects
              </Link>
              .
            </li>
          )}
          {totals.runningTimers > 0 && <li>⚠ A timer is still running; only time logged so far is included.</li>}
          {totals.skippedMinutes > 0 && (
            <li>{formatDecimalHours(totals.skippedMinutes)} h on non-billable projects is left off.</li>
          )}
        </ul>
      )}

      {nothingToBill && (
        <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
          Every project in this period has a $0.00 rate, so this invoice would be $0.00. Set the hourly rates under{" "}
          <Link href="/dashboard/clients" className="font-medium underline">
            Clients & Projects
          </Link>{" "}
          first, then come back.
        </p>
      )}
    </>
  );
}
