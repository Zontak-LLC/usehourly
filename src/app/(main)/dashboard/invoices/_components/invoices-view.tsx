"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageSize } from "@/components/use-page-size";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { totalsByCurrency } from "@/lib/money";
import { paginate } from "@/lib/paginate";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";
import { useToday } from "@/lib/use-today";

import { DeleteInvoiceDialog } from "./delete-invoice-dialog";
import { type InvoiceActionHandlers, InvoiceCard } from "./invoice-card";
import { InvoiceFilterBar } from "./invoice-filter-bar";
import { InvoiceTotals } from "./invoice-totals";
import type { InvoiceRow } from "./invoice-types";
import { useInvoiceFilters } from "./use-invoice-filters";

export function InvoicesView() {
  const utils = trpc.useUtils();
  const filters = useInvoiceFilters();
  // "Today" is the browser's date (the Worker runs in UTC); used to flag overdue invoices.
  const today = useToday();

  const clients = trpc.clients.list.useQuery();
  const invoices = trpc.invoice.list.useQuery(filters.listInput);
  const markPaid = trpc.invoice.markPaid.useMutation();
  const pageSize = usePageSize();
  const [pageNo, setPageNo] = useState(1);
  // A new search or filter starts again from the first page.
  const filterKey = JSON.stringify(filters.listInput);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the trigger
  useEffect(() => setPageNo(1), [filterKey]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteFor, setDeleteFor] = useState<{ id: string; number: string } | null>(null);

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

  const { filtering } = filters;
  // Nothing to search or filter until the first invoice exists.
  const showFilters = invoices.isLoading || filtering || filters.sort !== "newest" || (invoices.data?.length ?? 0) > 0;
  const groups = totalsByCurrency(invoices.data ?? []);

  const handlers = {
    busyId,
    paidBusy: markPaid.isPending,
    onSavePaid: (i: { id: string; number: string }, date: string | null) => setPaid(i.id, i.number, date),
    onDownload: (i: { id: string }) => void download(i.id),
    onDelete: (i: { id: string; number: string }) => setDeleteFor({ id: i.id, number: i.number }),
  };

  return (
    <PageShell
      nav="invoices"
      title="Invoices"
      description="Every invoice you've issued, saved exactly as sent."
      actions={
        <Button asChild size="lg" variant="primary" className="h-10 max-sm:w-10 max-sm:rounded-xl max-sm:px-0">
          <Link href="/dashboard/invoices/new" title="New invoice">
            <Plus className="max-sm:size-5" /> <span className="max-sm:sr-only">New invoice</span>
          </Link>
        </Button>
      }
    >
      {showFilters && (
        <>
          {(invoices.data?.length ?? 0) > 0 && <InvoiceTotals groups={groups} filtering={filtering} />}
          <div className="rounded-xl border bg-card p-3 sm:p-4">
            <InvoiceFilterBar filters={filters} clients={clients.data} today={today} />
          </div>
        </>
      )}

      {invoices.error ? (
        <Notice tone="danger">Couldn't load invoices: {invoices.error.message}</Notice>
      ) : invoices.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : invoices.data?.length === 0 ? (
        <EmptyState className="flex flex-col items-center gap-2 py-14">
          <FileText className="size-8 text-muted-foreground" />
          <p className="font-medium">{filtering ? "No invoices match that search." : "No invoices yet."}</p>
          {!filtering && (
            <p className="text-muted-foreground text-sm">Create one from the time you've already logged.</p>
          )}
        </EmptyState>
      ) : (
        <InvoiceList
          invoices={invoices.data ?? []}
          pageNo={pageNo}
          pageSize={pageSize}
          onPage={(n) => {
            setPageNo(n);
            // Landing on the new page at its top, not wherever the buttons were.
            document.getElementById("invoice-list")?.scrollIntoView({ block: "start" });
          }}
          today={today}
          handlers={handlers}
        />
      )}

      <DeleteInvoiceDialog invoice={deleteFor} onClose={() => setDeleteFor(null)} />
    </PageShell>
  );
}

/**
 * All the invoices in ONE card with a header, like every other page's sections: the invoices are tiles inside it, a few
 * per page (3 on a phone, 10 on a wide screen) with Previous and Next underneath.
 */
function InvoiceList({
  invoices,
  pageNo,
  pageSize,
  onPage,
  today,
  handlers,
}: {
  invoices: InvoiceRow[];
  pageNo: number;
  pageSize: number;
  onPage: (n: number) => void;
  today: string | null;
  handlers: InvoiceActionHandlers;
}) {
  const page = paginate(invoices, pageNo, pageSize);
  return (
    <section
      id="invoice-list"
      aria-label="Your invoices"
      className="scroll-mt-20 overflow-hidden rounded-xl border bg-card"
    >
      <header className="bg-band-2 px-3 py-3 sm:px-4">
        <h2 className="font-semibold text-base">Your invoices</h2>
        <p className="text-foreground/75 text-sm">
          {invoices.length} invoice{invoices.length === 1 ? "" : "s"}, newest first unless you sort otherwise.
        </p>
      </header>
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <ul className="flex flex-col gap-3">
          {page.items.map((i) => (
            <InvoiceCard key={i.id} invoice={i} today={today} handlers={handlers} />
          ))}
        </ul>
        <Pagination page={page} noun="invoices" onPage={onPage} />
      </div>
    </section>
  );
}
