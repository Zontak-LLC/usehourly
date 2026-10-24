"use client";

import { useState } from "react";

import Link from "next/link";

import { BellRing, CircleDollarSign, Download, Expand, Mail, Pencil, Printer, Trash2 } from "lucide-react";

import { ClientInitial } from "@/components/client-initial";
import { IconAction } from "@/components/icon-action";
import { InvoiceDocument } from "@/components/invoice-document";
import { MoreMenu } from "@/components/more-menu";
import { SendInvoicePanel } from "@/components/send-invoice-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import type { InvoiceSnapshot } from "@/lib/invoice";
import { invoicePath, invoiceState, type ListInvoice } from "@/lib/invoice-list";
import { formatMoney } from "@/lib/money";

import { DeleteInvoiceConfirm } from "./delete-invoice-dialog";
import { PaidPanel } from "./paid-panel";

type Panel = "paid" | "send" | "reminder" | "delete" | null;

/** The actions: 44px under 768px (the button sizes' own `max-md:` heights are overridden too), 40px above. */
const PILL = "h-11 rounded-full px-4 text-sm max-md:h-11 md:h-10";
const ICON = "size-11 max-md:size-11 md:size-10";

const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/**
 * The right side of Invoices (2026-10-24): the chosen invoice's header (number, client, amount, state in words), its
 * actions, the panel an action opens (Mark paid, Send, Write a reminder, Delete), and a smaller copy of what the client
 * sees, with "Open full size" for the whole page (Download PDF and Print there too).
 */
export function InvoiceDetail({
  invoice: i,
  doc,
  today,
  colour,
  pdfBusy,
  paidBusy,
  onDownload,
  onSavePaid,
  onDeleted,
}: {
  invoice: ListInvoice;
  /** The frozen copy, once it is in. */
  doc: { snapshot: InvoiceSnapshot; paidDate: string | null } | undefined;
  today: string | null;
  colour?: string;
  pdfBusy: boolean;
  paidBusy: boolean;
  onDownload: () => void;
  onSavePaid: (date: string | null) => Promise<void>;
  onDeleted: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const state = invoiceState(i, today);
  const toggle = (next: Exclude<Panel, null>) => setPanel((p) => (p === next ? null : next));
  const close = () => setPanel(null);
  return (
    <section aria-label={`Invoice ${i.number}`} className="flex min-w-0 flex-1 flex-col gap-4 p-3 sm:p-5">
      {/* On a phone the amount and its state take their own line, so the number is never cut. */}
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 print:hidden">
        <ClientInitial name={i.client_name} colour={colour} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-bold font-display text-2xl leading-tight">{i.number}</h2>
          <p className="truncate text-foreground/70 text-sm">
            {i.client_name} · {short.format(fromISODate(i.period_from))} – {short.format(fromISODate(i.period_to))} ·{" "}
            {formatDuration(i.total_minutes)} h
          </p>
        </div>
        <div className="shrink-0 text-right max-sm:flex max-sm:basis-full max-sm:items-baseline max-sm:justify-between max-sm:text-left">
          <p className="font-bold font-display text-2xl tabular-nums leading-tight tracking-tight">
            {formatMoney(i.total_cents, i.currency)}
          </p>
          <p className="inline-flex items-center gap-1.5 text-sm" data-testid="invoice-state">
            <span aria-hidden className="size-2 rounded-full" style={{ background: state.colour }} />
            {state.words}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1 print:hidden" data-testid="invoice-actions">
        {!i.paid_date && (
          <Button
            variant="outline"
            className={`gap-1.5 ${PILL}`}
            aria-expanded={panel === "paid"}
            onClick={() => toggle("paid")}
          >
            <CircleDollarSign className="size-4" /> Mark paid
          </Button>
        )}
        {/* Overdue: the envelope's place goes to the reminder (issue 100); sending the invoice again is in the ··· menu. */}
        {state.late ? (
          <IconAction
            label={`Write a reminder for ${i.number}`}
            tip="Write a reminder"
            text="Write a reminder"
            inline
            className={PILL}
            expanded={panel === "reminder"}
            onClick={() => toggle("reminder")}
          >
            <BellRing />
          </IconAction>
        ) : (
          <IconAction
            label={`Send ${i.number}`}
            tip="Send"
            text="Send"
            inline
            className={PILL}
            expanded={panel === "send"}
            onClick={() => toggle("send")}
          >
            <Mail />
          </IconAction>
        )}
        <IconAction
          label={pdfBusy ? `Making the PDF of ${i.number}` : `Download ${i.number} as a PDF`}
          tip="Download PDF"
          className={ICON}
          onClick={() => !pdfBusy && onDownload()}
        >
          <Download />
        </IconAction>
        <MoreMenu
          label={`More actions for ${i.number}`}
          className={ICON}
          items={[
            ...(i.paid_date ? [{ label: "Edit payment", icon: <Pencil />, onSelect: () => setPanel("paid") }] : []),
            ...(state.late
              ? [{ label: "Send the invoice again", icon: <Mail />, onSelect: () => setPanel("send") }]
              : []),
            { label: "Print", icon: <Printer />, onSelect: () => window.print() },
            { label: "Delete invoice", icon: <Trash2 />, onSelect: () => setPanel("delete"), destructive: true },
          ]}
        />
      </div>

      {panel && (
        // The panels were made to open under a list row (their own top rule); here they sit in one framed box.
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10 print:hidden [&>section]:border-t-0">
          {panel === "paid" && (
            <PaidPanel invoice={i} today={today ?? ""} busy={paidBusy} onSave={onSavePaid} onClose={close} />
          )}
          {panel === "send" && <SendInvoicePanel invoice={i} onClose={close} />}
          {panel === "reminder" && (
            <SendInvoicePanel key="reminder" invoice={i} reminder={state.late} onClose={close} />
          )}
          {panel === "delete" && (
            <DeleteInvoiceConfirm
              invoice={i}
              onClose={close}
              onDeleted={() => {
                close();
                onDeleted();
              }}
            />
          )}
        </div>
      )}

      <div className="flex flex-col gap-2" data-testid="invoice-preview">
        <div className="flex items-center justify-between gap-2 print:hidden">
          <p className="font-mono font-semibold text-[10.5px] text-foreground/70 uppercase tracking-wider">
            What your client sees
          </p>
          <Link
            href={`${invoicePath(i.id)}?full=1`}
            className="inline-flex min-h-11 items-center gap-1.5 px-1 font-medium text-sm underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
          >
            <Expand className="size-4" aria-hidden /> Open full size
          </Link>
        </div>
        {/* A smaller copy from 768px (zoom keeps the layout true, unlike a transform); full size on a phone and on paper. */}
        <div className="flex flex-col gap-5 rounded-xl bg-background p-4 ring-1 ring-foreground/10 md:[zoom:0.8] print:bg-transparent print:p-0 print:ring-0 print:[zoom:1]">
          {doc ? (
            <InvoiceDocument s={doc.snapshot} paidDate={doc.paidDate} preview />
          ) : (
            <Skeleton className="h-96 w-full" />
          )}
        </div>
      </div>
    </section>
  );
}
