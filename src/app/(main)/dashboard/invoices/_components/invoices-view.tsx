"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import {
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  Download,
  Ellipsis,
  FileText,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { SendInvoiceDialog } from "@/components/send-invoice-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fromISODate, toISODate } from "@/lib/dates";
import { formatDecimalHours } from "@/lib/duration";
import { formatMoney } from "@/lib/invoice";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { trpc } from "@/lib/trpc";

const dateFmt = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });
const fmt = (iso: string) => dateFmt.format(fromISODate(iso));

/** Mark an invoice paid on a date (defaults to today), change that date, or mark it unpaid. */
function PaidDialog({
  invoice,
  today,
  onSave,
  onClose,
  busy,
}: {
  invoice: { number: string; paid_date: string | null } | null;
  today: string;
  onSave: (date: string | null) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const [date, setDate] = useState(today);
  useEffect(() => {
    if (invoice) setDate(invoice.paid_date ?? today);
  }, [invoice, today]);

  async function save(next: string | null) {
    await onSave(next);
    onClose();
  }

  return (
    <Dialog open={invoice !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {invoice?.paid_date ? "Payment received" : "Mark as paid"} · {invoice?.number}
          </DialogTitle>
          <DialogDescription>When did the money arrive? It counts toward that year's income.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="paid-date">Date the money arrived</Label>
          <Input id="paid-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          {invoice?.paid_date ? (
            <Button variant="ghost" disabled={busy} onClick={() => save(null)}>
              Mark unpaid
            </Button>
          ) : (
            <span />
          )}
          <Button disabled={busy || !date} onClick={() => save(date)}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function InvoicesView() {
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState<"all" | "unpaid" | "paid">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");
  // "Today" is the browser's date (the Worker runs in UTC); used to flag overdue invoices.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(toISODate(new Date())), []);
  // Debounce so each keystroke isn't a server query.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const clients = trpc.clients.list.useQuery();
  const invoices = trpc.invoice.list.useQuery({
    q: q || undefined,
    clientId: clientId || undefined,
    status: status === "all" ? undefined : status,
    from: from || undefined,
    to: to || undefined,
    sort: sort === "newest" ? undefined : sort,
  });
  const del = trpc.invoice.delete.useMutation();
  const markPaid = trpc.invoice.markPaid.useMutation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sendFor, setSendFor] = useState<{ id: string; number: string } | null>(null);
  const [paidFor, setPaidFor] = useState<{ id: string; number: string; paid_date: string | null } | null>(null);

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
      toast.error(err instanceof Error ? err.message : "Couldn't update that invoice.");
    }
  }

  async function remove(id: string, number: string) {
    if (!window.confirm(`Delete invoice ${number}? This can't be undone.`)) return;
    try {
      await del.mutateAsync({ id });
      await utils.invoice.list.invalidate();
      toast.success(`Invoice ${number} deleted.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete that invoice.");
    }
  }

  const filtering = !!q || !!clientId || status !== "all" || !!from || !!to;
  // Nothing to search or filter until the first invoice exists.
  const showFilters = invoices.isLoading || filtering || sort !== "newest" || (invoices.data?.length ?? 0) > 0;
  const total = (invoices.data ?? []).reduce((a, i) => a + i.total_cents, 0);
  const unpaid = (invoices.data ?? []).filter((i) => !i.paid_date).reduce((a, i) => a + i.total_cents, 0);

  type Row = NonNullable<typeof invoices.data>[number];
  const statusOf = (i: Row) => (
    <>
      {i.paid_date ? (
        <span className="inline-flex items-center gap-1.5 text-success">
          <CircleCheck aria-hidden className="size-4 shrink-0" />
          Paid {fmt(i.paid_date)}
        </span>
      ) : today && i.due_date && i.due_date < today ? (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          Overdue · <strong className="font-semibold">due {fmt(i.due_date)}</strong>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <CircleAlert aria-hidden className="size-4 shrink-0 text-destructive" />
          Unpaid
          {i.due_date && (
            <>
              {" "}
              · <strong className="font-semibold text-foreground">due {fmt(i.due_date)}</strong>
            </>
          )}
        </span>
      )}
    </>
  );
  // Two labelled buttons (Mark paid while unpaid, Send) and one menu with words, instead of a row of unlabeled icons.
  const actionsOf = (i: Row) => (
    <div data-testid="invoice-actions" className="flex items-center gap-1">
      {!i.paid_date && (
        <Button
          size="sm"
          variant="outline"
          className="border-success/40 text-success hover:bg-success-soft hover:text-success"
          onClick={() => setPaidFor({ id: i.id, number: i.number, paid_date: i.paid_date })}
        >
          <CircleDollarSign /> Mark paid
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => setSendFor({ id: i.id, number: i.number })}>
        <Send /> Send
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={`More actions for ${i.number}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onSelect={() => setPaidFor({ id: i.id, number: i.number, paid_date: i.paid_date })}>
            <CircleDollarSign /> {i.paid_date ? "Edit payment…" : "Mark as paid…"}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={busyId === i.id} onSelect={() => void download(i.id)}>
            <Download /> Download PDF
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void remove(i.id, i.number)}>
            <Trash2 /> Delete invoice…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const summary = (
    <p className="px-4 py-2 text-right text-muted-foreground text-xs">
      {invoices.data?.length} invoice{invoices.data?.length === 1 ? "" : "s"} ·{" "}
      <span className="font-medium font-mono text-foreground">{formatMoney(total)}</span>
      {unpaid > 0 && (
        <>
          {" "}
          · <span className="font-medium font-mono text-foreground">{formatMoney(unpaid)}</span> unpaid
        </>
      )}
      {filtering ? " (filtered)" : ""}
    </p>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-semibold text-xl">Invoices</h1>
          <p className="text-muted-foreground text-sm">Every invoice you've issued, saved exactly as sent.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/invoices/new">
            <Plus /> New invoice
          </Link>
        </Button>
      </div>

      {showFilters && (
        <>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Search number, client, project or note…"
                aria-label="Search invoices"
                className="h-9 pl-8"
              />
            </div>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              aria-label="Filter by client"
              className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
            >
              <option value="">All clients</option>
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "all" | "unpaid" | "paid")}
              aria-label="Filter by payment status"
              className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
            >
              <option value="all">All statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              aria-label="Sort invoices"
              className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="highest">Highest amount</option>
              <option value="lowest">Lowest amount</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Issued from</span>
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Issued from"
              className="h-9 w-40"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Issued to"
              className="h-9 w-40"
            />
            {(filtering || sort !== "newest") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setText("");
                  setQ("");
                  setClientId("");
                  setStatus("all");
                  setFrom("");
                  setTo("");
                  setSort("newest");
                }}
              >
                Clear all
              </Button>
            )}
          </div>
        </>
      )}

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
        <>
          <ul className="flex flex-col gap-3">
            {invoices.data?.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate">
                    <span className="font-semibold">{i.number}</span>
                    <span className="text-muted-foreground"> · {i.client_name}</span>
                  </p>
                  <p className="shrink-0 font-semibold font-mono text-lg tabular-nums">{formatMoney(i.total_cents)}</p>
                </div>
                {i.summary && <p className="line-clamp-2 break-words text-sm">{i.summary}</p>}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-2">
                  <p className="text-sm">{statusOf(i)}</p>
                  <p className="min-w-0 flex-1 text-muted-foreground text-xs">
                    {fmt(i.period_from)} – {fmt(i.period_to)} · {formatDecimalHours(i.total_minutes)} h · issued{" "}
                    {fmt(i.issue_date)}
                  </p>
                  <div className="flex shrink-0">{actionsOf(i)}</div>
                </div>
              </li>
            ))}
            <li className="rounded-xl border bg-card">{summary}</li>
          </ul>
        </>
      )}

      <SendInvoiceDialog invoice={sendFor} onClose={() => setSendFor(null)} />
      <PaidDialog
        invoice={paidFor}
        today={today ?? ""}
        busy={markPaid.isPending}
        onSave={(date) => (paidFor ? setPaid(paidFor.id, paidFor.number, date) : Promise.resolve())}
        onClose={() => setPaidFor(null)}
      />
    </div>
  );
}
