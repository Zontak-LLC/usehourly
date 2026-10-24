"use client";

import { useMemo, useRef, useState } from "react";

import Link from "next/link";

import { CircleDollarSign, Download, Mail, Pencil, Search, Trash2 } from "lucide-react";

import { ClientInitial } from "@/components/client-initial";
import { IconAction } from "@/components/icon-action";
import { MoreMenu } from "@/components/more-menu";
import { Pagination } from "@/components/pagination";
import { SendInvoicePanel } from "@/components/send-invoice-panel";
import { Button } from "@/components/ui/button";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { formatMoney } from "@/lib/money";
import { paginate } from "@/lib/paginate";
import { PALETTE } from "@/lib/palette";
import { count } from "@/lib/plural";

import { DeleteInvoiceConfirm } from "./delete-invoice-dialog";
import type { InvoiceRow } from "./invoice-types";
import { PaidPanel } from "./paid-panel";

/*
 * "Your invoices" as a list you read at a glance (2026-10-23).
 * Tabs (All · Waiting · Overdue · Paid) instead of a Filters button, invoices grouped by the month they were issued, and
 * each invoice saying its state in words with one clear next step. The number still downloads the PDF; nothing leaves
 * the list.
 */

export type InvoiceActionHandlers = {
  busyId: string | null;
  /** Saving a payment date (null = mark unpaid) is in flight. */
  paidBusy: boolean;
  onSavePaid: (i: InvoiceRow, date: string | null) => Promise<void>;
  onDownload: (i: InvoiceRow) => void;
};

type Tab = "all" | "waiting" | "overdue" | "paid";
type Panel = "paid" | "send" | "delete" | null;

const short = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const monthName = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string) {
  return Math.round((fromISODate(to).getTime() - fromISODate(from).getTime()) / DAY_MS);
}

function stateOf(i: InvoiceRow, today: string | null): { tab: Exclude<Tab, "all">; words: string; colour: string } {
  if (i.paid_date)
    return { tab: "paid", words: `Paid ${short.format(fromISODate(i.paid_date))}`, colour: PALETTE.money.paid };
  if (today && i.due_date && i.due_date < today) {
    const late = daysBetween(i.due_date, today);
    return { tab: "overdue", words: `${count(late, "day")} late`, colour: PALETTE.money.late };
  }
  if (today && i.due_date) {
    const left = daysBetween(today, i.due_date);
    return {
      tab: "waiting",
      words: left === 0 ? "Due today" : `Due in ${count(left, "day")}`,
      colour: PALETTE.money.waiting,
    };
  }
  return { tab: "waiting", words: "Waiting", colour: PALETTE.money.waiting };
}

export function InvoiceList({
  invoices,
  today,
  handlers,
  colourOf,
  pageSize,
}: {
  invoices: InvoiceRow[];
  today: string | null;
  handlers: InvoiceActionHandlers;
  /** The client's own colour, for the tile. */
  colourOf: (clientId: string) => string | undefined;
  pageSize: number;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [pageNo, setPageNo] = useState(1);

  const counts = useMemo(() => {
    const c = { all: invoices.length, waiting: 0, overdue: 0, paid: 0 };
    for (const i of invoices) c[stateOf(i, today).tab]++;
    return c;
  }, [invoices, today]);

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = invoices.filter((i) => {
    if (tab !== "all" && stateOf(i, today).tab !== tab) return false;
    const text = `${i.number} ${i.client_name} ${i.summary ?? ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const page = paginate(shown, pageNo, pageSize);

  // The page's invoices under the month they were issued in, newest month first (the list is already newest first).
  const months: { key: string; items: InvoiceRow[] }[] = [];
  for (const i of page.items) {
    const key = i.issue_date.slice(0, 7);
    const last = months.at(-1);
    if (last?.key === key) last.items.push(i);
    else months.push({ key, items: [i] });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "waiting", label: "Waiting" },
    { id: "overdue", label: "Overdue" },
    { id: "paid", label: "Paid" },
  ];

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <div role="tablist" aria-label="Show invoices" className="flex flex-wrap gap-1 rounded-full bg-muted p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setPageNo(1);
              }}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-medium text-sm transition-colors ${
                tab === t.id ? "bg-foreground text-background" : "text-foreground/75 hover:text-foreground"
              }`}
            >
              {t.label}
              <span className="font-mono text-xs tabular-nums opacity-70">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <label className="relative max-sm:w-full sm:w-64">
          <span className="sr-only">Search invoices</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/50"
          />
          <input
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPageNo(1);
            }}
            placeholder="Number, client, work…"
            className="h-10 w-full rounded-full border bg-card pr-10 pl-9 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="px-3 py-10 text-center text-muted-foreground text-sm sm:px-4">
          {tab === "overdue" && !q ? "Nothing is late. Nice." : "No invoices match that."}
        </p>
      ) : (
        months.map((m) => {
          const sum = m.items.reduce((s, i) => s + i.total_cents, 0);
          const currency = m.items[0]?.currency ?? "USD";
          const oneCurrency = m.items.every((i) => i.currency === currency);
          return (
            <section key={m.key} aria-label={monthName.format(fromISODate(`${m.key}-01`))}>
              <h3 className="flex items-baseline justify-between gap-3 border-t bg-band-3 px-3 py-2 font-mono text-[11px] text-foreground/75 uppercase tracking-widest sm:px-4">
                <span>{monthName.format(fromISODate(`${m.key}-01`))}</span>
                <span className="tabular-nums">
                  {oneCurrency ? `${formatMoney(sum, currency)} · ` : ""}
                  {count(m.items.length, "invoice")}
                </span>
              </h3>
              <ul>
                {m.items.map((i) => (
                  <InvoiceSlip
                    key={i.id}
                    invoice={i}
                    today={today}
                    handlers={handlers}
                    colour={i.client_id ? colourOf(i.client_id) : undefined}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {page.pages > 1 && (
        <div className="border-t p-3 sm:p-4">
          <Pagination page={page} noun="invoices" onPage={setPageNo} />
        </div>
      )}
    </div>
  );
}

/** One invoice: who and what on the left, the amount and its state in words on the right, then the next step. */
function InvoiceSlip({
  invoice: i,
  today,
  handlers,
  colour,
}: {
  invoice: InvoiceRow;
  today: string | null;
  handlers: InvoiceActionHandlers;
  colour?: string;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const state = stateOf(i, today);
  const toggle = (next: Exclude<Panel, null>) => setPanel((p) => (p === next ? null : next));
  const busy = handlers.busyId === i.id;
  return (
    <li
      className="border-t"
      style={
        state.tab === "overdue"
          ? { boxShadow: `inset 3px 0 0 0 color-mix(in oklab, ${PALETTE.money.late} 75%, transparent)` }
          : undefined
      }
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_15rem] sm:px-4">
        <ClientInitial name={i.client_name} colour={colour} />

        <div className="min-w-0">
          <p className="truncate text-sm">
            {/* The number is the invoice: it opens the invoice's own page (issue 219; it used to download the PDF). */}
            <Link
              href={`/dashboard/invoices/${i.id}`}
              aria-label={`${i.number}: open the invoice`}
              className="font-semibold underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
            >
              {i.number}
            </Link>
            <span className="text-foreground/75"> · {i.client_name}</span>
          </p>
          {i.summary && <p className="truncate text-foreground/75 text-sm">{i.summary}</p>}
          <p className="font-mono text-[11px] text-foreground/60 tabular-nums">
            {short.format(fromISODate(i.period_from))} – {short.format(fromISODate(i.period_to))} ·{" "}
            {formatDuration(i.total_minutes)} h
          </p>
        </div>

        <div className="text-right">
          <p className="font-mono font-semibold text-base tabular-nums leading-tight tracking-tight">
            {formatMoney(i.total_cents, i.currency)}
          </p>
          <p className="inline-flex items-center gap-1.5 text-xs" style={{ color: state.colour }}>
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: state.colour }} />
            <span className="text-foreground/85">{state.words}</span>
          </p>
        </div>

        <div className="flex items-center justify-end gap-1 max-sm:col-span-3">
          {!i.paid_date && (
            <Button
              variant="outline"
              className="h-9 gap-1.5 rounded-full px-3 max-sm:flex-1"
              aria-expanded={panel === "paid"}
              onClick={() => toggle("paid")}
            >
              <CircleDollarSign className="size-4" /> Mark paid
            </Button>
          )}
          <IconAction
            label={`Send ${i.number}`}
            tip="Send"
            inline
            expanded={panel === "send"}
            onClick={() => toggle("send")}
          >
            <Mail />
          </IconAction>
          <IconAction
            label={busy ? `Making the PDF of ${i.number}` : `Download ${i.number} as a PDF`}
            tip="Download PDF"
            inline
            onClick={() => !busy && handlers.onDownload(i)}
          >
            <Download />
          </IconAction>
          <MoreMenu
            label={`More actions for ${i.number}`}
            items={[
              ...(i.paid_date ? [{ label: "Edit payment", icon: <Pencil />, onSelect: () => setPanel("paid") }] : []),
              { label: "Delete invoice", icon: <Trash2 />, onSelect: () => setPanel("delete"), destructive: true },
            ]}
          />
        </div>
      </div>
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
    </li>
  );
}
