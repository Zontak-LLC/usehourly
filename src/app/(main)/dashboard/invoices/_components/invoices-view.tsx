"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { CircleCheck, Download, FileText, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { fromISODate, toISODate } from "@/lib/dates";
import { formatDecimalHours } from "@/lib/duration";
import { formatMoney } from "@/lib/invoice";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { trpc } from "@/lib/trpc";

const dateFmt = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });
const fmt = (iso: string) => dateFmt.format(fromISODate(iso));

/** Mark an invoice paid on a date (defaults to today), change that date, or mark it unpaid. */
function PaidPopover({
  number,
  paidDate,
  today,
  onSave,
  busy,
}: {
  number: string;
  paidDate: string | null;
  today: string;
  onSave: (date: string | null) => Promise<void>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(paidDate ?? today);

  async function save(next: string | null) {
    await onSave(next);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDate(paidDate ?? today);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={paidDate ? `Edit payment of ${number}` : `Mark ${number} paid`}
          title={paidDate ? "Edit payment" : "Mark paid"}
        >
          <CircleCheck className={paidDate ? "text-success" : ""} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="end">
        <p className="font-medium text-sm">
          {paidDate ? "Payment received" : "Mark as paid"} · {number}
        </p>
        <div className="grid gap-1.5">
          <label htmlFor={`paid-${number}`} className="text-muted-foreground text-xs">
            Date the money arrived
          </label>
          <Input id={`paid-${number}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          {paidDate ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(null)}>
              Mark unpaid
            </Button>
          ) : (
            <span />
          )}
          <Button size="sm" disabled={busy || !date} onClick={() => save(date)}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
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
  const total = (invoices.data ?? []).reduce((a, i) => a + i.total_cents, 0);
  const unpaid = (invoices.data ?? []).filter((i) => !i.paid_date).reduce((a, i) => a + i.total_cents, 0);

  type Row = NonNullable<typeof invoices.data>[number];
  const statusOf = (i: Row) => (
    <>
      {i.paid_date ? (
        <span className="text-success">Paid {fmt(i.paid_date)}</span>
      ) : today && i.due_date && i.due_date < today ? (
        <span className="text-destructive">Overdue · due {fmt(i.due_date)}</span>
      ) : (
        <span className="text-muted-foreground">Unpaid{i.due_date ? ` · due ${fmt(i.due_date)}` : ""}</span>
      )}
    </>
  );
  const actionsOf = (i: Row) => (
    <>
      <PaidPopover
        // Re-mount when the saved payment changes so the date field resets.
        key={`${i.id}:${i.paid_date ?? ""}`}
        number={i.number}
        paidDate={i.paid_date}
        today={today ?? ""}
        busy={markPaid.isPending}
        onSave={(date) => setPaid(i.id, i.number, date)}
      />
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Download ${i.number} as PDF`}
        title="Download PDF"
        disabled={busyId === i.id}
        onClick={() => download(i.id)}
      >
        <Download />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Delete ${i.number}`}
        title="Delete"
        onClick={() => remove(i.id, i.number)}
      >
        <Trash2 />
      </Button>
    </>
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
          <ul className="flex flex-col gap-3 md:hidden">
            {invoices.data?.map((i) => (
              <li key={i.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{i.number}</span>
                  <span className="font-medium font-mono tabular-nums">{formatMoney(i.total_cents)}</span>
                </div>
                <p className="mt-0.5">{i.client_name}</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {fmt(i.period_from)} – {fmt(i.period_to)}
                </p>
                <p className="text-muted-foreground text-sm">
                  Issued {fmt(i.issue_date)} · {formatDecimalHours(i.total_minutes)} h
                </p>
                <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
                  <p className="min-w-0 text-sm">{statusOf(i)}</p>
                  <div className="flex shrink-0">{actionsOf(i)}</div>
                </div>
              </li>
            ))}
            <li className="rounded-xl border bg-card">{summary}</li>
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2 font-normal">Invoice</th>
                  <th className="px-4 py-2 font-normal">Client</th>
                  <th className="px-4 py-2 font-normal">Period</th>
                  <th className="px-4 py-2 font-normal">Issued</th>
                  <th className="px-4 py-2 text-right font-normal">Hours</th>
                  <th className="px-4 py-2 text-right font-normal">Total</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                  <th className="w-32" />
                </tr>
              </thead>
              <tbody>
                {invoices.data?.map((i) => (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium">{i.number}</td>
                    <td className="px-4 py-2.5">{i.client_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {fmt(i.period_from)} – {fmt(i.period_to)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmt(i.issue_date)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatDecimalHours(i.total_minutes)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium font-mono tabular-nums">
                      {formatMoney(i.total_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{statusOf(i)}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end">{actionsOf(i)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t">{summary}</div>
          </div>
        </>
      )}
    </div>
  );
}
