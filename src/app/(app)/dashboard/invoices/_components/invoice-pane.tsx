"use client";

import { useState } from "react";

import Link from "next/link";

import { toast } from "sonner";

import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/ui/skeleton";
import type { InvoiceSnapshot } from "@/lib/invoice";
import { invoiceFromSnapshot, type ListInvoice } from "@/lib/invoice-list";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import { InvoiceDetail } from "./invoice-detail";

type Doc = { id: string; snapshot: InvoiceSnapshot; paidDate: string | null };

/**
 * The frozen copy of the invoice on the right. Called by the page itself (not the pane), so its query starts in the
 * page's first render and joins the one batched request: by id when the address names one, else the newest invoice
 * (which is the first one of the All tab, shown before anyone picks). A later pick asks by id (one request, after a click).
 */
export function useShownInvoice(routeId: string | null, selectedId: string | null) {
  const latest = trpc.invoice.latest.useQuery(undefined, { enabled: !routeId });
  const fromLatest = latest.data && latest.data.id === selectedId ? latest.data : undefined;
  const got = trpc.invoice.get.useQuery(
    { id: selectedId ?? "" },
    { enabled: Boolean(selectedId) && !fromLatest, retry: false },
  );
  const doc: Doc | undefined = fromLatest ?? (got.data?.id === selectedId ? got.data : undefined);
  return { doc, missing: Boolean(routeId && got.error) };
}

/** The right side: the chosen invoice, a calm note for an address that names no invoice of yours, or a placeholder. */
export function InvoicePane({
  selectedId,
  row,
  shown,
  today,
  colourOf,
  onOpen,
}: {
  selectedId: string | null;
  /** The chosen invoice's row in the list, when the list holds it. */
  row: ListInvoice | undefined;
  shown: ReturnType<typeof useShownInvoice>;
  today: string | null;
  colourOf: (clientId: string) => string | undefined;
  onOpen: (id: string | null) => void;
}) {
  const utils = trpc.useUtils();
  const markPaid = trpc.invoice.markPaid.useMutation();
  const [pdfBusy, setPdfBusy] = useState(false);
  const { doc } = shown;
  // An invoice older than the list's newest 200 still opens: its header is read from its frozen copy.
  const invoice = row ?? (doc && selectedId ? invoiceFromSnapshot(selectedId, doc.snapshot, doc.paidDate) : null);

  if (!invoice) {
    if (shown.missing)
      return (
        <div className="p-4">
          <Notice>
            This invoice is not on your list. It may have been deleted.{" "}
            <Link
              href="/dashboard/invoices"
              onClick={(e) => {
                e.preventDefault();
                onOpen(null);
              }}
              className="underline underline-offset-4"
            >
              Back to your invoices
            </Link>
          </Notice>
        </div>
      );
    return selectedId ? (
      <Skeleton className="m-4 h-96" />
    ) : (
      <p className="p-6 text-center text-muted-foreground text-sm">Pick an invoice on the left to see it here.</p>
    );
  }

  async function download(id: string) {
    setPdfBusy(true);
    try {
      const { snapshot } = doc?.id === id ? doc : await utils.invoice.get.fetch({ id });
      await downloadInvoicePdf(snapshot);
    } catch (err) {
      toast.error(err instanceof Error ? `Couldn't create the PDF: ${err.message}` : "Couldn't create the PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function setPaid(id: string, number: string, paidDate: string | null) {
    try {
      await markPaid.mutateAsync({ id, paidDate });
      await Promise.all([
        utils.invoice.list.invalidate(),
        utils.invoice.get.invalidate({ id }),
        utils.invoice.latest.invalidate(),
        utils.report.annual.invalidate(),
      ]);
      toast.success(paidDate ? `Invoice ${number} marked paid.` : `Invoice ${number} marked unpaid.`);
    } catch (err) {
      toastError(err, "Couldn't update that invoice.");
    }
  }

  return (
    <InvoiceDetail
      key={invoice.id}
      invoice={invoice}
      doc={doc}
      today={today}
      colour={invoice.client_id ? colourOf(invoice.client_id) : undefined}
      pdfBusy={pdfBusy}
      paidBusy={markPaid.isPending}
      onDownload={() => void download(invoice.id)}
      onSavePaid={(date) => setPaid(invoice.id, invoice.number, date)}
      onDeleted={() => onOpen(null)}
    />
  );
}
