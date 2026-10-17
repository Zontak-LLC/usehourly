"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { addDays, toISODate } from "@/lib/dates";
import { formatDecimalHours } from "@/lib/duration";
import { buildInvoice, formatMoney, type InvoiceEntry } from "@/lib/invoice";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { trpc } from "@/lib/trpc";

export function NewInvoiceView() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const me = trpc.account.me.useQuery();
  const clients = trpc.clients.list.useQuery();
  const create = trpc.invoice.create.useMutation();

  const [today, setToday] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [number, setNumber] = useState("");
  const [numberTouched, setNumberTouched] = useState(false);
  const [netDays, setNetDays] = useState("30");
  const [notes, setNotes] = useState("");
  const [includeDetail, setIncludeDetail] = useState(true);
  const [compactNotes, setCompactNotes] = useState(false);

  useEffect(() => {
    const t = toISODate(new Date());
    setToday(t);
    setFrom(`${t.slice(0, 7)}-01`);
    setTo(t);
  }, []);

  const year = today ? Number(today.slice(0, 4)) : 0;
  const next = trpc.invoice.nextNumber.useQuery({ year }, { enabled: year > 0 });
  useEffect(() => {
    if (!numberTouched && next.data) setNumber(next.data.number);
  }, [next.data, numberTouched]);

  // Default to the first client once loaded.
  useEffect(() => {
    if (!clientId && clients.data?.[0]) setClientId(clients.data[0].id);
  }, [clients.data, clientId]);

  const client = clients.data?.find((c) => c.id === clientId);
  const validRange = !!from && !!to && from <= to;
  const entries = trpc.entry.list.useQuery({ from, to }, { enabled: validRange });

  // Live preview uses the same math the server will snapshot.
  const totals = useMemo(
    () =>
      // Match by the project's client (not the active-project list) so archived projects count,
      // exactly as the server does.
      buildInvoice(((entries.data ?? []) as unknown as InvoiceEntry[]).filter((e) => e.project.client_id === clientId)),
    [entries.data, clientId],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!client || !today) return;
    const days = Number.parseInt(netDays, 10);
    try {
      const { snapshot } = await create.mutateAsync({
        clientId: client.id,
        from,
        to,
        number,
        issueDate: today,
        dueDate: Number.isFinite(days) && days >= 0 ? addDays(today, days) : null,
        notes,
        includeDetail,
        compactNotes,
      });
      await utils.invoice.list.invalidate();
      try {
        await downloadInvoicePdf(snapshot);
      } catch (err) {
        // The invoice is saved either way; it can be downloaded again from the history page.
        toast.error(
          `Invoice saved, but the PDF couldn't be created: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
      toast.success(`Invoice ${snapshot.number} saved.`);
      router.push("/dashboard/invoices");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the invoice.");
    }
  }

  if (clients.isLoading || me.isLoading || !today) return <Skeleton className="mx-auto h-96 w-full max-w-3xl" />;

  const missingProfile = !me.data?.ein || !me.data?.address;
  const hasClients = (clients.data ?? []).length > 0;

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="font-semibold text-xl">New invoice</h1>
        <p className="text-muted-foreground text-sm">
          Built from your billable time. Saved to{" "}
          <Link href="/dashboard/invoices" className="underline">
            history
          </Link>{" "}
          and downloaded as a PDF.
        </p>
      </div>

      {missingProfile && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Your {!me.data?.ein ? "EIN" : ""}
            {!me.data?.ein && !me.data?.address ? " and " : ""}
            {!me.data?.address ? "address" : ""} {!me.data?.ein && !me.data?.address ? "are" : "is"} missing and won't
            appear on the invoice.{" "}
            <Link href="/dashboard/account" className="font-medium underline">
              Add business details
            </Link>
          </span>
        </p>
      )}

      {!hasClients ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
          Add a client and project first, then log some time to invoice.
        </p>
      ) : (
        <>
          <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="client">Client</Label>
              <select
                id="client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
              >
                {clients.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="number">Invoice number</Label>
              <Input
                id="number"
                value={number}
                onChange={(e) => {
                  setNumber(e.target.value);
                  setNumberTouched(true);
                }}
                required
                maxLength={40}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="net">Payment due in (days)</Label>
              <Input
                id="net"
                type="number"
                min={0}
                max={365}
                value={netDays}
                onChange={(e) => setNetDays(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={includeDetail}
                onChange={(e) => setIncludeDetail(e.target.checked)}
                className="size-4"
              />
              Include day-by-day time detail
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={compactNotes}
                onChange={(e) => setCompactNotes(e.target.checked)}
                className="size-4"
              />
              Short descriptions on the summary (full text stays in the time detail)
            </label>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="notes">Notes / payment terms</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="e.g. Please pay by ACH to … Thank you!"
              />
            </div>
          </div>

          <div className="rounded-xl border bg-card">
            <h2 className="border-b px-4 py-3 font-medium">Preview</h2>
            {!validRange ? (
              <p className="px-4 py-8 text-center text-muted-foreground text-sm">
                The start date must be on or before the end date.
              </p>
            ) : entries.isLoading ? (
              <Skeleton className="m-4 h-24" />
            ) : entries.error ? (
              <p className="px-4 py-6 text-destructive text-sm">Couldn't load time: {entries.error.message}</p>
            ) : totals.lines.length === 0 ? (
              <p className="px-4 py-8 text-center text-muted-foreground text-sm">
                No billable time for {client?.name} in this period.
              </p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {totals.lines.map((l) => (
                    <tr key={l.projectId} className="border-b">
                      <td className="px-4 py-2">{l.project}</td>
                      <td className="px-4 py-2 text-right font-mono text-muted-foreground tabular-nums">
                        {formatDecimalHours(l.minutes)} h × {formatMoney(l.rateCents)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium font-mono tabular-nums">
                        {formatMoney(l.amountCents)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40 font-semibold">
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatDecimalHours(totals.totalMinutes)} h
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatMoney(totals.totalCents)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {(totals.zeroRateProjects.length > 0 || totals.runningTimers > 0 || totals.skippedMinutes > 0) && (
            <ul className="flex flex-col gap-1 text-muted-foreground text-sm">
              {totals.zeroRateProjects.length > 0 && (
                <li>
                  ⚠ No hourly rate set for {totals.zeroRateProjects.join(", ")} — billed at $0.00. Set it under{" "}
                  <Link href="/dashboard/clients" className="underline">
                    Clients &amp; projects
                  </Link>
                  .
                </li>
              )}
              {totals.runningTimers > 0 && <li>⚠ A timer is still running; only time logged so far is included.</li>}
              {totals.skippedMinutes > 0 && (
                <li>{formatDecimalHours(totals.skippedMinutes)} h on non-billable projects is left off.</li>
              )}
            </ul>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={create.isPending || !validRange || totals.lines.length === 0}>
              {create.isPending ? "Creating…" : "Create invoice & download PDF"}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/dashboard/invoices">Cancel</Link>
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
