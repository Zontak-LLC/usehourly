"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays, toISODate } from "@/lib/dates";
import { buildInvoice } from "@/lib/invoice";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import type { Rounding } from "@/lib/rounding";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import { InvoiceDetailsCard } from "./invoice-details-card";
import { InvoiceNotices, InvoicePreviewCard } from "./invoice-preview";

function MissingProfileNotice({ ein, address }: { ein?: string | null; address?: string | null }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>
        Your {!ein ? "EIN" : ""}
        {!ein && !address ? " and " : ""}
        {!address ? "address" : ""} {!ein && !address ? "are" : "is"} missing and won't appear on the invoice.{" "}
        <Link href="/dashboard/account" className="inline-block py-1 font-medium underline">
          Add business details
        </Link>
      </span>
    </p>
  );
}

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
        (entries.data ?? []).filter((e) => e.project.client_id === clientId),
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
          <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
            Add a client and project first, then log some time to invoice.
          </p>
        ) : (
          <>
            <InvoiceDetailsCard
              clients={clients.data ?? []}
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

            <InvoicePreviewCard
              validRange={validRange}
              loading={entries.isLoading}
              error={entries.error?.message ?? null}
              totals={totals}
              clientName={client?.name}
            />

            <InvoiceNotices totals={totals} rounding={rounding} nothingToBill={nothingToBill} />

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={create.isPending || !validRange || totals.lines.length === 0 || nothingToBill}
              >
                {create.isPending ? "Creating…" : "Create invoice & download PDF"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/invoices">Cancel</Link>
              </Button>
            </div>
          </>
        )}
      </PageShell>
    </form>
  );
}
