"use client";

import { useState } from "react";

import Link from "next/link";

import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { SendInvoiceDialog } from "@/components/send-invoice-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";
import { useToday } from "@/lib/use-today";

import { DeleteInvoiceDialog } from "./delete-invoice-dialog";
import { InvoiceCard } from "./invoice-card";
import { InvoiceFilterBar } from "./invoice-filter-bar";
import { InvoiceTotals } from "./invoice-totals";
import { PaidDialog } from "./paid-dialog";
import { useInvoiceFilters } from "./use-invoice-filters";

export function InvoicesView() {
  const utils = trpc.useUtils();
  const filters = useInvoiceFilters();
  // "Today" is the browser's date (the Worker runs in UTC); used to flag overdue invoices.
  const today = useToday();

  const clients = trpc.clients.list.useQuery();
  const invoices = trpc.invoice.list.useQuery(filters.listInput);
  const markPaid = trpc.invoice.markPaid.useMutation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sendFor, setSendFor] = useState<{ id: string; number: string } | null>(null);
  const [paidFor, setPaidFor] = useState<{ id: string; number: string; paid_date: string | null } | null>(null);
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
  const total = (invoices.data ?? []).reduce((a, i) => a + i.total_cents, 0);
  const unpaid = (invoices.data ?? []).filter((i) => !i.paid_date).reduce((a, i) => a + i.total_cents, 0);

  const handlers = {
    busyId,
    onMarkPaid: (i: { id: string; number: string; paid_date: string | null }) =>
      setPaidFor({ id: i.id, number: i.number, paid_date: i.paid_date }),
    onSend: (i: { id: string; number: string }) => setSendFor({ id: i.id, number: i.number }),
    onDownload: (i: { id: string }) => void download(i.id),
    onDelete: (i: { id: string; number: string }) => setDeleteFor({ id: i.id, number: i.number }),
  };

  return (
    <PageShell
      title="Invoices"
      description="Every invoice you've issued, saved exactly as sent."
      actions={
        <Button asChild size="lg" className="h-10">
          <Link href="/dashboard/invoices/new">
            <Plus /> New invoice
          </Link>
        </Button>
      }
    >
      {showFilters && (
        <>
          {(invoices.data?.length ?? 0) > 0 && (
            <InvoiceTotals count={invoices.data?.length ?? 0} total={total} unpaid={unpaid} filtering={filtering} />
          )}
          <InvoiceFilterBar filters={filters} clients={clients.data} today={today} />
        </>
      )}
      {/* The page's header card: what this page is, the button to make one, and where the money stands. */}

      {invoices.error ? (
        <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
          Couldn't load invoices: {invoices.error.message}
        </p>
      ) : invoices.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : invoices.data?.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <p className="font-medium">{filtering ? "No invoices match that search." : "No invoices yet."}</p>
          {!filtering && (
            <p className="text-muted-foreground text-sm">Create one from the time you've already logged.</p>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {invoices.data?.map((i) => (
            <InvoiceCard key={i.id} invoice={i} today={today} handlers={handlers} />
          ))}
        </ul>
      )}

      <DeleteInvoiceDialog invoice={deleteFor} onClose={() => setDeleteFor(null)} />
      <SendInvoiceDialog invoice={sendFor} onClose={() => setSendFor(null)} />
      <PaidDialog
        invoice={paidFor}
        today={today ?? ""}
        busy={markPaid.isPending}
        onSave={(date) => (paidFor ? setPaid(paidFor.id, paidFor.number, date) : Promise.resolve())}
        onClose={() => setPaidFor(null)}
      />
    </PageShell>
  );
}
