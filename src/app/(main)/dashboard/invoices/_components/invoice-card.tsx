"use client";

import { useState } from "react";

import { CircleAlert, CircleCheck, CircleDollarSign, Download, Send, Trash2 } from "lucide-react";

import { IconAction } from "@/components/icon-action";
import { MoreMenu } from "@/components/more-menu";
import { SendInvoicePanel } from "@/components/send-invoice-panel";
import { fromISODate } from "@/lib/dates";
import { formatDecimalHours } from "@/lib/duration";
import { formatMoney } from "@/lib/money";

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

export type InvoiceActionHandlers = {
  busyId: string | null;
  /** Saving a payment date (null = mark unpaid) is in flight. */
  paidBusy: boolean;
  onSavePaid: (i: InvoiceRow, date: string | null) => Promise<void>;
  onDownload: (i: InvoiceRow) => void;
  onDelete: (i: InvoiceRow) => void;
};

type Panel = "paid" | "send" | null;

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
        text={words ? (i.paid_date ? "Payment" : "Mark paid") : undefined}
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
        text={words ? "Send" : undefined}
        expanded={panel === "send"}
        onClick={() => toggle("send")}
      >
        <Send />
      </IconAction>
      <MoreMenu
        label={`More actions for ${i.number}`}
        items={[
          {
            label: handlers.busyId === i.id ? "Making the PDF…" : "Download PDF",
            icon: <Download />,
            onSelect: () => handlers.onDownload(i),
            disabled: handlers.busyId === i.id,
          },
          { label: "Delete invoice", icon: <Trash2 />, onSelect: () => handlers.onDelete(i), destructive: true },
        ]}
      />
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
  const [panel, setPanel] = useState<Panel>(null);
  return (
    <li className="overflow-hidden rounded-xl border bg-card">
      {/* Header: which invoice, and the actions pinned on the right (same shape as the entry cards). */}
      <div className="flex items-center justify-between gap-3 border-b bg-band-2 px-4 py-2">
        <p className="min-w-0 truncate">
          <span className="font-semibold">{i.number}</span>
          <span className="text-muted-foreground"> · {i.client_name}</span>
        </p>
        <div className="flex shrink-0 max-sm:hidden">
          <InvoiceActions invoice={i} panel={panel} onPanel={setPanel} handlers={handlers} />
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
          <p className="shrink-0 font-mono font-semibold text-lg tabular-nums">
            {formatMoney(i.total_cents, i.currency)}
          </p>
        </div>
      </div>
      {/* The forms open here, in the card, not in a popup. */}
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
      {/* On a phone the actions get words and a full-width row; tooltips do not exist on touch. */}
      <div className="border-t p-2 sm:hidden">
        <InvoiceActions invoice={i} words panel={panel} onPanel={setPanel} handlers={handlers} />
      </div>
    </li>
  );
}
