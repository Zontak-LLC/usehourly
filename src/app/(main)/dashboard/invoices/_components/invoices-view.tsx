"use client";

import { useState } from "react";

import Link from "next/link";

import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageSize } from "@/components/use-page-size";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { totalsByCurrency } from "@/lib/money";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";
import { useToday } from "@/lib/use-today";

import { InvoiceHero } from "./invoice-hero";
import { InvoiceList } from "./invoice-list";
import { InvoiceTotals } from "./invoice-totals";

export function InvoicesView() {
  const utils = trpc.useUtils();
  // "Today" is the browser's date (the Worker runs in UTC); used to say what is due and what is late.
  const today = useToday();

  const clients = trpc.clients.list.useQuery();
  // The tabs and the search in the list work on what is loaded (the account's most recent invoices).
  const invoices = trpc.invoice.list.useQuery();
  const markPaid = trpc.invoice.markPaid.useMutation();
  const pageSize = usePageSize();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function download(id: string) {
    setBusyId(id);
    try {
      const { snapshot } = await utils.invoice.get.fetch({ id });
      await downloadInvoicePdf(snapshot);
    } catch (err) {
      toast.error(err instanceof Error ? `Couldn't create the PDF: ${err.message}` : "Couldn't create the PDF.");
    } finally {
      setBusyId(null);
    }
  }

  async function setPaid(id: string, number: string, paidDate: string | null) {
    try {
      await markPaid.mutateAsync({ id, paidDate });
      await Promise.all([utils.invoice.list.invalidate(), utils.report.annual.invalidate()]);
      toast.success(paidDate ? `Invoice ${number} marked paid.` : `Invoice ${number} marked unpaid.`);
    } catch (err) {
      toastError(err, "Couldn't update that invoice.");
    }
  }

  const groups = totalsByCurrency(invoices.data ?? []);
  const handlers = {
    busyId,
    paidBusy: markPaid.isPending,
    onSavePaid: (i: { id: string; number: string }, date: string | null) => setPaid(i.id, i.number, date),
    onDownload: (i: { id: string }) => void download(i.id),
  };

  return (
    <PageShell
      nav="invoices"
      title="Invoices"
      description="Every invoice you've issued, saved exactly as sent."
      actions={
        <Button asChild size="icon" variant="outline" className="size-10">
          <Link href="/dashboard/invoices/new" aria-label="New invoice" title="New invoice">
            <Plus />
          </Link>
        </Button>
      }
    >
      {invoices.data?.length === 0 ? (
        <EmptyState className="flex flex-col items-center gap-2 py-14">
          <FileText className="size-8 text-muted-foreground" />
          <p className="font-medium">No invoices yet.</p>
          <p className="text-muted-foreground text-sm">Create one from the time you've already logged.</p>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {groups[0] && (
            <InvoiceHero
              invoices={invoices.data ?? []}
              currency={groups[0].currency}
              total={groups[0].total}
              unpaid={groups[0].unpaid}
              today={today}
            />
          )}
          <section
            id="invoice-list"
            aria-label="Your invoices"
            className="scroll-mt-20 overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-sheet)]"
          >
            <header className="flex flex-col gap-1 bg-band-2 px-3 py-3 sm:px-4">
              <h2 className="font-semibold text-base">Your invoices</h2>
              {/* With one currency the summary above already says it; with several, each currency gets its own line. */}
              {groups.length > 1 && <InvoiceTotals groups={groups} filtering={false} />}
            </header>
            {invoices.error ? (
              <div className="p-3 sm:p-4">
                <Notice tone="danger">Couldn't load invoices: {invoices.error.message}</Notice>
              </div>
            ) : invoices.isLoading ? (
              <Skeleton className="m-3 h-32 sm:m-4" />
            ) : (
              <InvoiceList
                invoices={invoices.data ?? []}
                today={today}
                handlers={handlers}
                pageSize={pageSize}
                colourOf={(id) => clients.data?.find((c) => c.id === id)?.color ?? undefined}
              />
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}
