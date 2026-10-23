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
import { buildInvoice, type InvoiceEntry } from "@/lib/invoice";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import type { Rounding } from "@/lib/rounding";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import { InvoiceDetailsCard } from "./invoice-details-card";
import { InvoiceNotices, InvoicePreviewCard } from "./invoice-preview";

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
 * The client the builder opens on: the one asked for in the address (`?client=`) when it exists,
 * else the client with the most billable minutes in the period, else the first client.
 */
function defaultClientId(
  clients: { id: string }[],
  entries: (InvoiceEntry & { non_billable?: boolean })[],
  wanted: string | null,
): string {
  if (wanted && clients.some((c) => c.id === wanted)) return wanted;
  const minutes = new Map<string, number>();
  for (const e of entries) {
    const id = e.project.client_id;
    if (!id || e.non_billable || !e.project.billable || e.minutes <= 0) continue;
    minutes.set(id, (minutes.get(id) ?? 0) + e.minutes);
  }
  let best = clients[0]?.id ?? "";
  let most = 0;
  for (const c of clients) {
    const m = minutes.get(c.id) ?? 0;
    if (m > most) {
      best = c.id;
      most = m;
    }
  }
  return best;
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
  const entries = trpc.entry.list.useQuery({ from, to }, { enabled: validRange });

  // Open on a client that has time to bill, using the period's entries this page loads anyway
  // (no extra request). Chosen once; the person's own choice is never overwritten.
  const entriesSettled = !!today && (!validRange || entries.isSuccess || entries.isError);
  useEffect(() => {
    if (clientId || !clients.data?.length || !entriesSettled) return;
    setClientId(defaultClientId(clients.data, entries.data ?? [], wantedClient));
  }, [clients.data, clientId, entriesSettled, entries.data, wantedClient]);

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
        // Days marked non-billable are never invoiced (the server skips them too).
        (entries.data ?? []).filter((e) => e.project.client_id === clientId && !e.non_billable),
        rounding,
      ),
    [entries.data, clientId, rounding],
  );
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
      toastError(err, "Couldn't create the invoice.");
    }
  }

  if (clients.isLoading || me.isLoading || !today) return <Skeleton className="mx-auto h-96 w-full max-w-5xl" />;

  const missingProfile = !me.data?.ein || !me.data?.address;
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
        {missingProfile && <MissingProfileNotice ein={me.data?.ein} address={me.data?.address} />}

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
              onFrom={setFrom}
              onTo={setTo}
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
                  loading={entries.isLoading}
                  error={entries.error?.message ?? null}
                  totals={totals}
                  clientName={client?.name}
                />

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
