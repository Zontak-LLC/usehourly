"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AlertTriangle, FileCheck2 } from "lucide-react";
import { toast } from "sonner";

import { ClientCurrency } from "@/components/currency-provider";
import { DocButton } from "@/components/doc-button";
import { EmptyState } from "@/components/empty-state";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays, toISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { feature } from "@/lib/features";
import { buildInvoice } from "@/lib/invoice";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import type { Rounding } from "@/lib/rounding";
import { invoiceTax } from "@/lib/tax";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";
import { invoicePeriodStart, type Unbilled } from "@/lib/unbilled";

import { InvoiceDetailsCard } from "./invoice-details-card";
import { InvoiceNotices, InvoicePreviewCard, TaxChoice } from "./invoice-preview";

function MissingProfileNotice({ ein, address }: { ein?: string | null; address?: string | null }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border bg-muted/60 p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>
        Your {!ein ? "tax ID (EIN)" : ""}
        {!ein && !address ? " and " : ""}
        {!address ? "address" : ""} {!ein && !address ? "are" : "is"} missing and won't appear on the invoice.{" "}
        <Link href="/dashboard/account" className="inline-block py-1 font-medium underline">
          Add business details
        </Link>
      </span>
    </p>
  );
}

/**
 * The client the builder opens on: the one asked for in the address (`?client=`) when it exists, else the client with
 * the most unbilled money, else the first client.
 */
function defaultClientId(clients: { id: string }[], unbilled: Unbilled[], wanted: string | null): string {
  if (wanted && clients.some((c) => c.id === wanted)) return wanted;
  let best = clients[0]?.id ?? "";
  let most = 0;
  for (const u of unbilled) {
    if (u.cents > most && clients.some((c) => c.id === u.clientId)) {
      best = u.clientId;
      most = u.cents;
    }
  }
  return best;
}

/** Time in the period already on an invoice: left out unless the person asks for it, and said so plainly. */
function AlreadyInvoiced({
  minutes,
  include,
  onInclude,
}: {
  minutes: number;
  include: boolean;
  onInclude: (v: boolean) => void;
}) {
  if (minutes <= 0) return null;
  return (
    <div className="grid gap-2 rounded-lg border bg-muted/60 p-3 text-sm">
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>
          {formatDuration(minutes)} of this client&rsquo;s time in this period is already on an invoice.{" "}
          {include ? "It is included again on this one." : "It is left out, so it is not billed twice."}
        </span>
      </p>
      <label className="flex min-h-9 items-center gap-2 pl-6">
        <input type="checkbox" checked={include} onChange={(e) => onInclude(e.target.checked)} className="size-4" />
        Bill it again anyway
      </label>
    </div>
  );
}

/**
 * The chosen client's entries for the period, asked for only once the period has settled. Before, the builder fetched
 * every client's entries for this month and then again for up to a year (megabytes on a busy account). It still reads
 * "loading" while the client or the period is being worked out, so the preview never flashes "no time".
 */
function useClientEntries(o: {
  from: string;
  to: string;
  clientId: string;
  validRange: boolean;
  periodSettled: boolean;
  unbilledPending: boolean;
}) {
  const entries = trpc.entry.list.useQuery(
    { from: o.from, to: o.to, clientId: o.clientId },
    { enabled: o.validRange && !!o.clientId && o.periodSettled },
  );
  const entriesLoading =
    entries.isLoading || (o.validRange && !!o.clientId && !o.periodSettled) || (!o.clientId && o.unbilledPending);
  return { entries, entriesLoading };
}

export function NewInvoiceView() {
  const router = useRouter();
  const wantedClient = useSearchParams().get("client");
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
  const [includeInvoiced, setIncludeInvoiced] = useState(false);
  // The account's tax is added unless the person leaves it off this one invoice (a reverse-charge client, say).
  const [addTax, setAddTax] = useState(true);
  // The period follows the chosen client's unbilled time until the person sets the dates themselves.
  const [rangeTouched, setRangeTouched] = useState(false);
  const unbilled = trpc.invoice.unbilled.useQuery();

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

  const client = clients.data?.find((c) => c.id === clientId);
  const validRange = !!from && !!to && from <= to;

  // Open on the client with the most unbilled money (or the one asked for). Chosen once; the person's own choice is
  // never overwritten.
  useEffect(() => {
    if (clientId || !clients.data?.length || !unbilled.data) return;
    setClientId(defaultClientId(clients.data, unbilled.data, wantedClient));
  }, [clients.data, clientId, unbilled.data, wantedClient]);
  // The period starts at the client's oldest unbilled day ("since the last invoice") and ends today.
  const unbilledFrom = unbilled.data?.find((u) => u.clientId === clientId)?.from;
  const defaultFrom = today ? invoicePeriodStart(today, unbilledFrom) : "";
  useEffect(() => {
    if (rangeTouched || !today) return;
    setFrom(defaultFrom);
    setTo(today);
  }, [defaultFrom, rangeTouched, today]);
  const { entries, entriesLoading } = useClientEntries({
    from,
    to,
    clientId,
    validRange,
    periodSettled: rangeTouched || (!unbilled.isPending && from === defaultFrom),
    unbilledPending: unbilled.isPending,
  });

  // Live preview uses the same math the server will snapshot.
  const rounding: Rounding = useMemo(
    () => ({
      step: client?.round_step ?? 0,
      mode: client?.round_mode === "nearest" ? "nearest" : "up",
      min: client?.round_min ?? 0,
    }),
    [client?.round_step, client?.round_mode, client?.round_min],
  );
  const totals = useMemo(
    () =>
      // Match by the project's client (not the active-project list) so archived projects count,
      // exactly as the server does.
      buildInvoice(
        // Days marked non-billable are never invoiced, and time already on an invoice is left out unless asked for
        // (the server does the same).
        (entries.data ?? []).filter(
          (e) => e.project.client_id === clientId && !e.non_billable && (includeInvoiced || !e.invoice_id),
        ),
        rounding,
      ),
    [entries.data, clientId, rounding, includeInvoiced],
  );
  const alreadyInvoiced = (entries.data ?? [])
    .filter((e) => e.project.client_id === clientId && e.invoice_id && e.project.billable && !e.non_billable)
    .reduce((a, e) => a + e.minutes, 0);
  const taxSetting =
    feature("invoiceTax") && me.data?.tax_rate ? { name: me.data.tax_name, rate: me.data.tax_rate } : null;
  const tax = addTax ? invoiceTax(totals.totalCents, taxSetting) : null;
  // A $0.00 invoice is never what anyone means: block it and say why.
  const nothingToBill = totals.lines.length > 0 && totals.totalCents === 0;

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
        includeInvoiced,
        addTax: !!taxSetting && addTax,
      });
      await Promise.all([
        utils.invoice.list.invalidate(),
        utils.invoice.unbilled.invalidate(),
        utils.entry.list.invalidate(),
      ]);
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
      toastError(err, "Couldn't create the invoice.");
    }
  }

  if (clients.isLoading || me.isLoading || !today) return <Skeleton className="mx-auto h-96 w-full max-w-5xl" />;

  // A tax number (VAT, GST) stands in for the US EIN when tax on invoices is on.
  const hasTaxId = !!me.data?.ein || (feature("invoiceTax") && !!me.data?.tax_number);
  const missingProfile = !hasTaxId || !me.data?.address;
  const hasClients = (clients.data ?? []).length > 0;

  return (
    <form method="post" onSubmit={submit}>
      <PageShell
        nav="invoices"
        title="New invoice"
        description={
          <>
            Built from your billable time. Saved to{" "}
            <Link href="/dashboard/invoices" className="underline">
              history
            </Link>{" "}
            and downloaded as a PDF.
          </>
        }
      >
        {missingProfile && <MissingProfileNotice ein={hasTaxId ? "set" : null} address={me.data?.address} />}

        {!hasClients ? (
          <EmptyState>Add a client and project first, then log some time to invoice.</EmptyState>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <InvoiceDetailsCard
              clients={clients.data ?? []}
              today={today}
              values={{ clientId, number, from, to, netDays, notes, includeDetail, compactNotes }}
              onClientId={setClientId}
              onNumber={(v) => {
                setNumber(v);
                setNumberTouched(true);
              }}
              onFrom={(v) => {
                setFrom(v);
                setRangeTouched(true);
              }}
              onTo={(v) => {
                setTo(v);
                setRangeTouched(true);
              }}
              onNetDays={setNetDays}
              onNotes={setNotes}
              onIncludeDetail={setIncludeDetail}
              onCompactNotes={setCompactNotes}
            />

            {/* The paper preview and the main action stay in view while the form scrolls. */}
            <div className="flex flex-col gap-4 lg:sticky lg:top-32">
              <ClientCurrency currency={client?.currency}>
                <InvoicePreviewCard
                  validRange={validRange}
                  loading={entriesLoading}
                  error={entries.error?.message ?? null}
                  totals={totals}
                  clientName={client?.name}
                  tax={tax}
                />
                {taxSetting && <TaxChoice tax={taxSetting} add={addTax} onAdd={setAddTax} />}

                <AlreadyInvoiced minutes={alreadyInvoiced} include={includeInvoiced} onInclude={setIncludeInvoiced} />
                <InvoiceNotices totals={totals} rounding={rounding} nothingToBill={nothingToBill} />
              </ClientCurrency>

              <div className="flex flex-wrap items-center gap-3">
                <DocButton
                  type="submit"
                  tone="amber"
                  icon={<FileCheck2 />}
                  title={create.isPending ? "Creating…" : "Create invoice"}
                  hint="and download the PDF"
                  label={create.isPending ? "Creating…" : "Create invoice & download PDF"}
                  busy={create.isPending}
                  disabled={create.isPending || !validRange || totals.lines.length === 0 || nothingToBill}
                />
                <Button type="button" variant="outline" asChild>
                  <Link href="/dashboard/invoices">Cancel</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </PageShell>
    </form>
  );
}
