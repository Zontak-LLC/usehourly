import Link from "next/link";

import type { Metadata } from "next";

import { LogoMark } from "@/components/logo";
import { fromISODate } from "@/lib/dates";
import { formatDecimalHours, formatDuration } from "@/lib/duration";
import { formatMoney, type InvoiceSnapshot } from "@/lib/invoice";
import { getPrisma } from "@/lib/prisma";
import { describeRounding } from "@/lib/rounding";
import { findInvoiceLinkByToken } from "@/server/invoice-link";
import { withInvoiceLogos } from "@/server/invoice-logos";

import { InvoiceActions } from "./_components/invoice-actions";

// A private link: never indexed, never followed, and the address is not passed on when someone clicks out.
export const metadata: Metadata = {
  title: "Invoice · UseHourly",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

const day = (iso: string) =>
  fromISODate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-3xl items-center px-4 py-5 print:hidden">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <LogoMark className="size-7" />
          UseHourly
        </Link>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pb-16 print:pb-0">{children}</main>
    </div>
  );
}

/** Unknown, turned-off and expired links all read the same, so a link cannot be used to find out which it was. */
function Unavailable() {
  return (
    <Frame>
      <div className="rounded-xl border bg-card p-6">
        <h1 className="font-semibold text-xl">This link isn't available any more</h1>
        <p className="mt-2 text-muted-foreground">
          The invoice link was turned off or has expired. Ask the person who sent it for a new one.
        </p>
      </div>
    </Frame>
  );
}

/** What the page can safely read from the stored text, or null if it is not an invoice snapshot. */
function readSnapshot(json: string): InvoiceSnapshot | null {
  try {
    const s = JSON.parse(json) as InvoiceSnapshot;
    return s && typeof s.number === "string" && Array.isArray(s.lines) && s.seller && s.client ? s : null;
  } catch {
    return null;
  }
}

export default async function SharedInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const prisma = await getPrisma();
  const link = await findInvoiceLinkByToken(prisma, token);
  const now = Math.floor(Date.now() / 1000);
  if (!link || link.revoked_at !== null || link.expires_at <= now) return <Unavailable />;

  // The invoice must belong to the account that made the link (it always does; this keeps the page honest).
  const invoice = await prisma.invoice.findFirst({
    where: { id: link.invoice_id, user_id: link.user_id },
    select: { snapshot: true, paid_date: true },
  });
  const frozen = invoice ? readSnapshot(invoice.snapshot) : null;
  if (!invoice || !frozen) return <Unavailable />;
  const s = await withInvoiceLogos(prisma, link.user_id, frozen);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !invoice.paid_date && s.dueDate !== null && s.dueDate < today;

  return (
    <Frame>
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
            <p className="text-muted-foreground text-sm">{s.seller.email}</p>
          </div>
        </div>
        <div className="text-right">
          <h1 className="font-semibold text-2xl tracking-tight">Invoice {s.number}</h1>
          <p className="text-muted-foreground text-sm">Issued {day(s.issueDate)}</p>
          {s.dueDate && <p className="text-muted-foreground text-sm">Due {day(s.dueDate)}</p>}
          <p className="text-muted-foreground text-sm">
            For {day(s.periodFrom)} – {day(s.periodTo)}
          </p>
        </div>
      </div>

      {invoice.paid_date ? (
        <p className="rounded-xl border border-success/40 bg-success-soft p-3 font-medium text-sm text-success">
          Paid on {day(invoice.paid_date)}. Thank you.
        </p>
      ) : overdue ? (
        <p className="rounded-xl border border-destructive/40 p-3 font-medium text-destructive text-sm">
          This invoice was due on {day(s.dueDate as string)}.
        </p>
      ) : null}

      <section className="rounded-xl border bg-card p-4">
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

      {s.seller.paymentInstructions && !invoice.paid_date && (
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

      <InvoiceActions snapshot={s} />

      <p className="text-muted-foreground text-xs print:hidden">
        Sent with UseHourly. This link works until {day(new Date(link.expires_at * 1000).toISOString().slice(0, 10))}.
      </p>
    </Frame>
  );
}
