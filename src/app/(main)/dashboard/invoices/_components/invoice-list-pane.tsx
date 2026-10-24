"use client";

import { ClientInitial } from "@/components/client-initial";
import { ListSearch } from "@/components/list-search";
import { Pagination } from "@/components/pagination";
import { SplitGroup, SplitRow } from "@/components/split-view";
import { fromISODate } from "@/lib/dates";
import {
  byMonth,
  INVOICE_TABS,
  type InvoiceTab,
  invoicePath,
  invoiceState,
  type ListInvoice,
  type MoneyLine,
} from "@/lib/invoice-list";
import { formatMoney } from "@/lib/money";
import type { Page } from "@/lib/paginate";
import { count } from "@/lib/plural";

const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

/**
 * The left side of Invoices (2026-10-24): one quiet money line, the tabs, the search, then the invoices under the
 * month they were issued in, one compact row each (number, client, amount, its state in words), a page at a time.
 */
export function InvoiceListPane({
  page,
  money,
  counts,
  tab,
  onTab,
  search,
  onSearch,
  onPage,
  selectedId,
  onOpen,
  today,
  colourOf,
}: {
  /** This page of what the tab and the search show. */
  page: Page<ListInvoice>;
  money: MoneyLine[];
  counts: Record<InvoiceTab, number>;
  tab: InvoiceTab;
  onTab: (tab: InvoiceTab) => void;
  search: string;
  onSearch: (q: string) => void;
  onPage: (page: number) => void;
  selectedId: string | null;
  onOpen: (id: string) => void;
  today: string | null;
  colourOf: (clientId: string) => string | undefined;
}) {
  return (
    <section aria-label="Your invoices" className="flex flex-col gap-2 p-2">
      <MoneyLines lines={money} />
      {/* Four equal cells, the count under each word: one row on a 320px phone and in the list column. */}
      <div role="tablist" aria-label="Show invoices" className="grid grid-cols-4 gap-0.5 rounded-xl bg-muted p-1">
        {INVOICE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`flex min-h-11 min-w-0 flex-col items-center justify-center rounded-lg px-1 font-medium text-[13px] leading-tight transition-colors ${
              tab === t.id
                ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10 dark:bg-foreground/15"
                : "text-foreground/75 hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="font-mono text-[11px] tabular-nums opacity-70">{counts[t.id]}</span>
          </button>
        ))}
      </div>
      <ListSearch label="Search invoices" value={search} onChange={onSearch} />

      {page.total === 0 ? (
        <p className="px-2 py-8 text-center text-muted-foreground text-sm">
          {tab === "overdue" && !search ? "Nothing is late. Nice." : "No invoices match that."}
        </p>
      ) : (
        <div className="flex flex-col">
          {byMonth(page.items).map((m) => {
            const sum = m.items.reduce((s, i) => s + i.total_cents, 0);
            const oneCurrency = m.items.every((i) => i.currency === m.items[0].currency);
            return (
              <SplitGroup
                key={m.key}
                id={`invoices-month-${m.key}`}
                title={monthName.format(fromISODate(`${m.key}-01`))}
                aside={oneCurrency ? formatMoney(sum, m.items[0].currency) : count(m.items.length, "invoice")}
              >
                {m.items.map((i) => (
                  <li key={i.id}>
                    <InvoiceRowLink
                      invoice={i}
                      selected={i.id === selectedId}
                      onOpen={() => onOpen(i.id)}
                      today={today}
                      colour={i.client_id ? colourOf(i.client_id) : undefined}
                    />
                  </li>
                ))}
              </SplitGroup>
            );
          })}
        </div>
      )}

      {page.pages > 1 && (
        <div className="px-1 pt-1">
          <Pagination page={page} noun="invoices" onPage={onPage} compact />
        </div>
      )}
    </section>
  );
}

/** "$95,591.25 paid · $9,143.75 unpaid · $1,312.50 late", one line per currency, never added across currencies. */
function MoneyLines({ lines }: { lines: MoneyLine[] }) {
  return (
    <div
      className="flex flex-col gap-0.5 px-2 pt-1 text-foreground/75 text-xs tabular-nums"
      data-testid="invoice-money"
    >
      {lines.map((l) => (
        <p key={l.currency} className="flex flex-wrap gap-x-1">
          <span className="whitespace-nowrap">
            <b className="font-semibold text-foreground">{formatMoney(l.paid, l.currency)}</b> paid ·
          </span>
          <span className="whitespace-nowrap">
            <b className="font-semibold text-foreground">{formatMoney(l.unpaid, l.currency)}</b> unpaid
            {l.late > 0 && " ·"}
          </span>
          {l.late > 0 && (
            <span className="whitespace-nowrap">
              <b className="font-semibold text-foreground">{formatMoney(l.late, l.currency)}</b> late
            </span>
          )}
        </p>
      ))}
    </div>
  );
}

function InvoiceRowLink({
  invoice: i,
  selected,
  onOpen,
  today,
  colour,
}: {
  invoice: ListInvoice;
  selected: boolean;
  onOpen: () => void;
  today: string | null;
  colour?: string;
}) {
  const state = invoiceState(i, today);
  return (
    <div data-testid="invoice-row" data-number={i.number} data-state={state.tab}>
      <SplitRow
        href={invoicePath(i.id)}
        selected={selected}
        onOpen={onOpen}
        leading={<ClientInitial name={i.client_name} colour={colour} />}
        title={i.number}
        line={i.client_name}
        trailing={
          <span className="flex flex-col items-end">
            <span className="font-mono font-semibold text-[13px] tabular-nums tracking-tight">
              {formatMoney(i.total_cents, i.currency)}
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-foreground/80">
              <span aria-hidden className="size-1.5 rounded-full" style={{ background: state.colour }} />
              {state.words}
            </span>
          </span>
        }
      />
    </div>
  );
}
