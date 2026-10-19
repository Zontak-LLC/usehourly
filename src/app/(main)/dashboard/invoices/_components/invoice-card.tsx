"use client";

import { CircleAlert, CircleCheck, CircleDollarSign, Download, Send, Trash2 } from "lucide-react";

import { IconAction } from "@/components/icon-action";
import { fromISODate } from "@/lib/dates";
import { formatDecimalHours } from "@/lib/duration";
import { formatMoney } from "@/lib/invoice";

import type { InvoiceRow } from "./invoice-types";

const dateFmt = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });
const fmt = (iso: string) => dateFmt.format(fromISODate(iso));

function InvoiceStatus({ invoice: i, today }: { invoice: InvoiceRow; today: string | null }) {
  if (i.paid_date) {
    return (
      <span className="inline-flex items-center gap-1.5 text-success">
        <CircleCheck aria-hidden className="size-4 shrink-0" />
        Paid {fmt(i.paid_date)}
      </span>
    );
  }
  if (today && i.due_date && i.due_date < today) {
    return (
      <span className="inline-flex items-center gap-1.5 text-destructive">
        <CircleAlert aria-hidden className="size-4 shrink-0" />
        Overdue · <strong className="font-semibold">due {fmt(i.due_date)}</strong>
      </span>
    );
  }
  return (
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
  );
}

export type InvoiceActionHandlers = {
  busyId: string | null;
  onMarkPaid: (i: InvoiceRow) => void;
  onSend: (i: InvoiceRow) => void;
  onDownload: (i: InvoiceRow) => void;
  onDelete: (i: InvoiceRow) => void;
};

/** Four icon buttons with tooltips: money (mark paid / edit payment), send, download, delete. */
function InvoiceActions({
  invoice: i,
  words = false,
  handlers,
}: {
  invoice: InvoiceRow;
  words?: boolean;
  handlers: InvoiceActionHandlers;
}) {
  return (
    <div
      data-testid="invoice-actions"
      className={words ? "flex w-full items-stretch gap-1.5" : "flex items-center gap-1"}
    >
      {/* One slot for the money: mark it paid, or (once paid) change when it was paid. */}
      <IconAction
        label={i.paid_date ? `Edit payment for ${i.number}` : `Mark ${i.number} as paid`}
        tip={i.paid_date ? "Edit payment" : "Mark as paid"}
        text={words ? (i.paid_date ? "Payment" : "Mark paid") : undefined}
        // Green means "this invoice is paid": only the paid state is green; marking it paid is a plain action.
        className={i.paid_date ? "border-success/40 text-success hover:bg-success-soft hover:text-success" : undefined}
        onClick={() => handlers.onMarkPaid(i)}
      >
        {i.paid_date ? <CircleCheck /> : <CircleDollarSign />}
      </IconAction>
      <IconAction
        label={`Send ${i.number}`}
        tip="Send to client"
        text={words ? "Send" : undefined}
        onClick={() => handlers.onSend(i)}
      >
        <Send />
      </IconAction>
      <IconAction
        label={`Download PDF for ${i.number}`}
        tip="Download PDF"
        text={words ? "PDF" : undefined}
        disabled={handlers.busyId === i.id}
        onClick={() => handlers.onDownload(i)}
      >
        <Download />
      </IconAction>
      <IconAction
        label={`Delete ${i.number}`}
        tip="Delete invoice"
        text={words ? "Delete" : undefined}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => handlers.onDelete(i)}
      >
        <Trash2 />
      </IconAction>
    </div>
  );
}

export function InvoiceCard({
  invoice: i,
  today,
  handlers,
}: {
  invoice: InvoiceRow;
  today: string | null;
  handlers: InvoiceActionHandlers;
}) {
  return (
    <li className="overflow-hidden rounded-xl border bg-card">
      {/* Header: which invoice, and the actions pinned on the right (same shape as the entry cards). */}
      <div className="flex items-center justify-between gap-3 border-b bg-band-2 px-4 py-2">
        <p className="min-w-0 truncate">
          <span className="font-semibold">{i.number}</span>
          <span className="text-muted-foreground"> · {i.client_name}</span>
        </p>
        <div className="flex shrink-0 max-sm:hidden">
          <InvoiceActions invoice={i} handlers={handlers} />
        </div>
      </div>
      <div className="flex flex-col gap-2 px-4 py-3">
        {i.summary && <p className="line-clamp-2 break-words text-sm">{i.summary}</p>}
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm">
              <InvoiceStatus invoice={i} today={today} />
            </p>
            <p className="text-muted-foreground text-xs">
              {fmt(i.period_from)} – {fmt(i.period_to)} · {formatDecimalHours(i.total_minutes)} h · issued{" "}
              {fmt(i.issue_date)}
            </p>
          </div>
          <p className="shrink-0 font-mono font-semibold text-lg tabular-nums">{formatMoney(i.total_cents)}</p>
        </div>
      </div>
      {/* On a phone the actions get words and a full-width row; tooltips do not exist on touch. */}
      <div className="border-t bg-muted/20 p-2 sm:hidden">
        <InvoiceActions invoice={i} words handlers={handlers} />
      </div>
    </li>
  );
}
