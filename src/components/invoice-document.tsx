import { InvoiceDocActions } from "@/components/invoice-doc-actions";
import { fromISODate } from "@/lib/dates";
import { formatDecimalHours, formatDuration } from "@/lib/duration";
import { formatMoney, type InvoiceSnapshot } from "@/lib/invoice";
import { describeRounding } from "@/lib/rounding";
import { taxNumberLine, taxRowLabel } from "@/lib/tax";

const day = (iso: string) =>
  fromISODate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** What a page can safely read from the stored text, or null if it is not an invoice snapshot. */
export function readSnapshot(json: string): InvoiceSnapshot | null {
  try {
    const s = JSON.parse(json) as InvoiceSnapshot;
    return s && typeof s.number === "string" && Array.isArray(s.lines) && s.seller && s.client ? s : null;
  } catch {
    return null;
  }
}

/**
 * One invoice as a page, from its frozen copy: seller, number and dates, paid or overdue, bill-to, the lines and total,
 * notes, how to pay, the time detail, and Download PDF / Print. The client's private link page and the freelancer's own
 * invoice page both show this, so the two can never differ.
 */
export function InvoiceDocument({
  s,
  paidDate,
  inApp = false,
}: {
  s: InvoiceSnapshot;
  paidDate: string | null;
  /** Shown inside the app (the page has its own title): the invoice's title is a second-level heading. */
  inApp?: boolean;
}) {
  const Title = inApp ? "h2" : "h1";
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !paidDate && s.dueDate !== null && s.dueDate < today;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {s.seller.logo && (
            // biome-ignore lint/performance/noImgElement: a small data-URL logo from the invoice itself
            <img src={s.seller.logo} alt="" className="size-14 rounded-md object-contain" />
          )}
          <div>
            <p className="font-semibold text-lg">{s.seller.name}</p>
            {s.seller.address && (
              <p className="whitespace-pre-line text-muted-foreground text-sm">{s.seller.address}</p>
            )}
            {s.seller.ein && <p className="text-muted-foreground text-sm">EIN {s.seller.ein}</p>}
            {s.seller.taxNumber && <p className="text-muted-foreground text-sm">{taxNumberLine(s.seller.taxNumber)}</p>}
            <p className="text-muted-foreground text-sm">{s.seller.email}</p>
          </div>
        </div>
        <div className="text-right">
          <Title className="font-semibold text-2xl tracking-tight">Invoice {s.number}</Title>
          <p className="text-muted-foreground text-sm">Issued {day(s.issueDate)}</p>
          {s.dueDate && <p className="text-muted-foreground text-sm">Due {day(s.dueDate)}</p>}
          <p className="text-muted-foreground text-sm">
            For {day(s.periodFrom)} – {day(s.periodTo)}
          </p>
        </div>
      </div>

      {paidDate ? (
        <p className="rounded-xl border border-success-bright/60 bg-success-soft p-3 font-medium text-sm text-success">
          Paid on {day(paidDate)}. Thank you.
        </p>
      ) : overdue ? (
        <p className="rounded-xl border border-destructive/40 p-3 font-medium text-destructive text-sm">
          This invoice was due on {day(s.dueDate as string)}.
        </p>
      ) : null}

      <section className="relative rounded-xl border bg-card p-4">
        {paidDate && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-3 right-4 rotate-[-10deg] rounded-md px-3 font-display font-extrabold text-2xl text-success tracking-widest opacity-90 ring-4 ring-success-bright ring-inset motion-safe:animate-[stamp_.45s_cubic-bezier(.2,1.6,.4,1)]"
          >
            PAID
          </span>
        )}
        <p className="text-muted-foreground text-sm">Bill to</p>
        <p className="font-medium">{s.client.legalName || s.client.name}</p>
        {s.client.address && <p className="whitespace-pre-line text-muted-foreground text-sm">{s.client.address}</p>}
      </section>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 text-right font-medium">Hours</th>
              <th className="px-3 py-2 text-right font-medium">Rate</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.projectId} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{l.project}</td>
                <td className="px-3 py-2 text-right">{formatDecimalHours(l.minutes)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(l.rateCents, s.currency)}/h</td>
                <td className="px-3 py-2 text-right">{formatMoney(l.amountCents, s.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {s.tax && (
              <>
                <tr>
                  <td className="px-3 pt-3" colSpan={3}>
                    Subtotal
                  </td>
                  <td className="px-3 pt-3 text-right">{formatMoney(s.subtotalCents ?? 0, s.currency)}</td>
                </tr>
                <tr>
                  <td className="px-3 pt-1" colSpan={3}>
                    {taxRowLabel(s.tax)}
                  </td>
                  <td className="px-3 pt-1 text-right">{formatMoney(s.tax.cents, s.currency)}</td>
                </tr>
              </>
            )}
            <tr className="font-semibold">
              <td className="px-3 py-3">Total</td>
              <td className="px-3 py-3 text-right">{formatDecimalHours(s.totalMinutes)}</td>
              <td />
              <td className="px-3 py-3 text-right text-base">{formatMoney(s.totalCents, s.currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {s.rounding && (
        <p className="text-muted-foreground text-sm">
          {describeRounding(s.rounding)}
          {s.loggedMinutes !== undefined && ` Logged: ${formatDecimalHours(s.loggedMinutes)} h.`}
        </p>
      )}

      {s.notes && <p className="whitespace-pre-wrap break-words text-sm">{s.notes}</p>}

      {s.seller.paymentInstructions && !paidDate && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold text-base">How to pay</h2>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{s.seller.paymentInstructions}</p>
        </section>
      )}

      {s.includeDetail && s.detail.length > 0 && (
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer font-semibold text-base">Time detail ({s.detail.length} entries)</summary>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {s.detail.map((d) => (
              <li key={`${d.date}|${d.project}|${d.note}|${d.minutes}`} className="grid gap-0.5">
                <span className="text-muted-foreground tabular-nums">
                  {day(d.date)} · {d.project} · {formatDuration(d.minutes)}
                </span>
                {d.note && <span className="whitespace-pre-wrap break-words">{d.note}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <InvoiceDocActions snapshot={s} />
    </>
  );
}
