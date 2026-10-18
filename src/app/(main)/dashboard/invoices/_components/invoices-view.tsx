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
  X,
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

const SELECT =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm max-md:h-10 dark:bg-input/30";

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
        <search aria-label="Find invoices" className="flex flex-col gap-3 rounded-xl border bg-card p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search invoices…"
              aria-label="Search invoices"
              className="pr-10 pl-8"
            />
            {text && (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setQ("");
                }}
                aria-label="Clear search"
                title="Clear search"
                className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Labelled controls in a grid: two across on a phone, one row on a wide screen. */}
          <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="grid min-w-0 gap-1">
              <label htmlFor="inv-client" className="text-muted-foreground text-xs">
                Client
              </label>
              <select id="inv-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={SELECT}>
                <option value="">All clients</option>
                {clients.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid min-w-0 gap-1">
              <label htmlFor="inv-status" className="text-muted-foreground text-xs">
                Status
              </label>
              <select
                id="inv-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as "all" | "unpaid" | "paid")}
                className={SELECT}
              >
                <option value="all">All statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div className="col-span-2 grid min-w-0 gap-1 sm:col-span-1">
              <label htmlFor="inv-sort" className="text-muted-foreground text-xs">
                Sort by
              </label>
              <select
                id="inv-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className={SELECT}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="highest">Highest amount</option>
                <option value="lowest">Lowest amount</option>
              </select>
            </div>
            <div className="grid min-w-0 gap-1">
              <label htmlFor="issued-from" className="text-muted-foreground text-xs">
                Issued from
              </label>
              <Input
                id="issued-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="min-w-0 sm:h-9"
              />
            </div>
            <div className="grid min-w-0 gap-1">
              <label htmlFor="issued-to" className="text-muted-foreground text-xs">
                Issued to
              </label>
              <Input
                id="issued-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="min-w-0 sm:h-9"
              />
            </div>
          </div>

          {(filtering || sort !== "newest") && (
            <div className="flex justify-end border-t pt-2">
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
                Clear all filters
              </Button>
            </div>
          )}
        </search>
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
                  <p className="text-sm max-sm:flex-1">{statusOf(i)}</p>
                  <p className="min-w-0 flex-1 text-muted-foreground text-xs max-sm:order-first max-sm:basis-full">
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
