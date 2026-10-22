"use client";

import { useState } from "react";

import { CircleAlert, CircleCheck, CircleDollarSign, Download, Send, Trash2 } from "lucide-react";

import { IconAction } from "@/components/icon-action";
import { MoreMenu } from "@/components/more-menu";
import { SendInvoicePanel } from "@/components/send-invoice-panel";
import { fromISODate } from "@/lib/dates";
import { formatDecimalHours } from "@/lib/duration";
import { INVOICE_COLORS } from "@/lib/invoice-colors";
import { formatMoney } from "@/lib/money";

import { DeleteInvoiceConfirm } from "./delete-invoice-dialog";
import type { InvoiceRow } from "./invoice-types";
import { PaidPanel } from "./paid-panel";

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

/** The colour of the stripe at the row's left edge: teal paid, coral overdue, violet waiting (a quiet hint, the words say it too). */
function stripeColour(i: InvoiceRow, today: string | null) {
  if (i.paid_date) return INVOICE_COLORS.paid;
  if (today && i.due_date && i.due_date < today) return INVOICE_COLORS.late;
  return INVOICE_COLORS.waiting;
}

export type InvoiceActionHandlers = {
  busyId: string | null;
  /** Saving a payment date (null = mark unpaid) is in flight. */
  paidBusy: boolean;
  onSavePaid: (i: InvoiceRow, date: string | null) => Promise<void>;
  onDownload: (i: InvoiceRow) => void;
};

type Panel = "paid" | "send" | "delete" | null;

/**
 * The two actions people use (money, send) stay visible and open a panel inside the card; the rarer ones (PDF, delete)
 * are behind the ··· menu (docs/ui-spec.md). On a phone the two visible ones carry words.
 */
function InvoiceActions({
  invoice: i,
  words = false,
  panel,
  onPanel,
  handlers,
}: {
  invoice: InvoiceRow;
  words?: boolean;
  panel: Panel;
  onPanel: (next: Panel) => void;
  handlers: InvoiceActionHandlers;
}) {
  const toggle = (next: Exclude<Panel, null>) => onPanel(panel === next ? null : next);
  return (
    <div
      data-testid="invoice-actions"
      className={words ? "flex w-full items-stretch gap-1.5" : "flex items-center gap-1"}
    >
      {/* One slot for the money: mark it paid, or (once paid) change when it was paid. */}
      <IconAction
        label={i.paid_date ? `Edit payment for ${i.number}` : `Mark ${i.number} as paid`}
        tip={i.paid_date ? "Edit payment" : "Mark as paid"}
        text={i.paid_date ? "Edit payment" : "Mark paid"}
        inline={!words}
        expanded={panel === "paid"}
        // Green means "this invoice is paid": only the paid state is green; marking it paid is a plain action.
        className={
          i.paid_date ? "border-success-bright/60 text-success hover:bg-success-soft hover:text-success" : undefined
        }
        onClick={() => toggle("paid")}
      >
        {i.paid_date ? <CircleCheck /> : <CircleDollarSign />}
      </IconAction>
      <IconAction
        label={`Send ${i.number}`}
        tip="Send to client"
        text="Send"
        inline={!words}
        expanded={panel === "send"}
        onClick={() => toggle("send")}
      >
        <Send />
      </IconAction>
      <MoreMenu
        label={`More actions for ${i.number}`}
        // On a phone the other two buttons carry words and are 48px tall; the ··· matches them.
        className={words ? "h-auto min-h-12 w-12 self-stretch" : undefined}
        items={[
          {
            label: handlers.busyId === i.id ? "Making the PDF…" : "Download PDF",
            icon: <Download />,
            onSelect: () => handlers.onDownload(i),
            disabled: handlers.busyId === i.id,
          },
          { label: "Delete invoice", icon: <Trash2 />, onSelect: () => onPanel("delete"), destructive: true },
        ]}
      />
    </div>
  );
}

/** The columns of the invoice table on a wide screen (the header row and every invoice row share them). */
export const INVOICE_COLS =
  "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_6.5rem_15rem]";

/** One invoice as a row of the table: who and what, status, period, total, then the actions (cards group, rows list). */
export function InvoiceLine({
  invoice: i,
  today,
  handlers,
}: {
  invoice: InvoiceRow;
  today: string | null;
  handlers: InvoiceActionHandlers;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  return (
    <li
      className="border-t first:border-t-0"
      style={{ boxShadow: `inset 3px 0 0 0 color-mix(in oklab, ${stripeColour(i, today)} 70%, transparent)` }}
    >
      <div className={`${INVOICE_COLS} items-center gap-x-3 gap-y-1 px-3 py-3 text-sm sm:px-4`}>
        <div className="min-w-0 sm:col-start-1 sm:row-start-1">
          <p className="truncate">
            <span className="font-semibold">{i.number}</span>
            <span className="text-muted-foreground"> · {i.client_name}</span>
          </p>
          {i.summary && <p className="line-clamp-1 break-words text-muted-foreground text-xs">{i.summary}</p>}
        </div>
        <p className="max-sm:col-span-2 max-sm:row-start-2 sm:col-start-2 sm:row-start-1">
          <InvoiceStatus invoice={i} today={today} />
        </p>
        <p className="text-muted-foreground text-xs max-sm:col-span-2 max-sm:row-start-3 sm:col-start-3 sm:row-start-1">
          {fmt(i.period_from)} – {fmt(i.period_to)} · {formatDecimalHours(i.total_minutes)} h
          <span className="sm:hidden"> · issued {fmt(i.issue_date)}</span>
        </p>
        <p className="text-right font-mono font-semibold text-base tabular-nums max-sm:col-start-2 max-sm:row-start-1 sm:col-start-4 sm:row-start-1">
          {formatMoney(i.total_cents, i.currency)}
        </p>
        <div className="flex justify-end max-sm:hidden sm:col-start-5 sm:row-start-1">
          <InvoiceActions invoice={i} panel={panel} onPanel={setPanel} handlers={handlers} />
        </div>
      </div>
      {/* The forms open here, under the row, not in a popup. */}
      {panel === "paid" && (
        <PaidPanel
          invoice={i}
          today={today ?? ""}
          busy={handlers.paidBusy}
          onSave={(date) => handlers.onSavePaid(i, date)}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "send" && <SendInvoicePanel invoice={i} onClose={() => setPanel(null)} />}
      {panel === "delete" && <DeleteInvoiceConfirm invoice={i} onClose={() => setPanel(null)} />}
      {/* On a phone the actions get words and a full-width row; tooltips do not exist on touch. */}
      <div className="px-3 pb-3 sm:hidden">
        <InvoiceActions invoice={i} words panel={panel} onPanel={setPanel} handlers={handlers} />
      </div>
    </li>
  );
}
