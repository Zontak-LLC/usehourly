"use client";

import Link from "next/link";

import { InvoiceDocument } from "@/components/invoice-document";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

/**
 * One invoice, opened from its number on the Invoices list (issue 219, 2026-10-23): the same page the client sees through
 * a private link (the frozen copy, the paid stamp, Download PDF and Print), inside the app.
 */
export function InvoiceView({ id }: { id: string }) {
  const invoice = trpc.invoice.get.useQuery({ id });
  return (
    <PageShell
      nav="invoices"
      title={invoice.data ? invoice.data.snapshot.number : "Invoice"}
      description={
        <Link href="/dashboard/invoices" className="py-1 font-medium text-foreground underline">
          Back to invoices
        </Link>
      }
      descriptionOnPhone
      inlineDescription
    >
      {invoice.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : invoice.error || !invoice.data ? (
        <Notice tone="danger">{invoice.error?.message ?? "Invoice not found."}</Notice>
      ) : (
        <InvoiceDocument s={invoice.data.snapshot} paidDate={invoice.data.paidDate} inApp />
      )}
    </PageShell>
  );
}
