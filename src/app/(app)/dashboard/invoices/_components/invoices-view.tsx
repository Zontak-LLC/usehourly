"use client";

import { useDeferredValue, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { FileText, Plus } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { SplitView } from "@/components/split-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvoicePages } from "@/components/use-invoice-pages";
import { usePageSize } from "@/components/use-page-size";
import { useUnbilled } from "@/components/use-unbilled";
import {
  filterInvoices,
  type InvoiceTab,
  invoiceIdFromPath,
  invoicePath,
  moneyLines,
  tabCounts,
} from "@/lib/invoice-list";
import { listPageInput, partialMonth } from "@/lib/invoice-pages";
import { paginate } from "@/lib/paginate";
import { trpc } from "@/lib/trpc";
import { useToday } from "@/lib/use-today";

import { InvoiceListPane } from "./invoice-list-pane";
import { InvoicePane, useShownInvoice } from "./invoice-pane";
import { InvoicesDue } from "./invoices-due";

/**
 * Invoices as a split view, like Clients (2026-10-24): the list on the left (money line, tabs, search, month groups),
 * the chosen invoice on the right (its header, actions, the panel an action opens, and a copy of what the client sees).
 * Each invoice has its own address (`/dashboard/invoices/<id>`); choosing one changes the address in place
 * (history.pushState, which Next follows), so the tab, the search and the scroll stay. A wide screen with no invoice
 * in the address shows the first one of the tab; a phone shows the list and the invoice as two screens.
 */
export function InvoicesView() {
  const pathname = usePathname();
  const routeId = invoiceIdFromPath(pathname);
  // "Today" is the browser's date (the Worker runs in UTC); used to say what is due and what is late.
  const today = useToday();

  const [tab, setTab] = useState<InvoiceTab>("all");
  const [search, setSearch] = useState("");
  // The server does the search: it is asked once typing settles, not on every key.
  const deferredSearch = useDeferredValue(search);
  const [pageNo, setPageNo] = useState(1);

  // Every query the page needs starts in this render, so they go out as ONE batched request.
  const clients = trpc.clients.list.useQuery();
  // The tab's invoices, 200 at a time, filtered and searched on the server. The money line and the tab counts come
  // from the server over EVERY invoice (issue 451); they wait for the browser's today.
  const invoices = useInvoicePages(listPageInput({ tab, search: deferredSearch, today }));
  const totals = trpc.invoice.totals.useQuery({ today: today ?? "" }, { enabled: today !== null });
  const unbilled = useUnbilled();
  const pageSize = usePageSize();

  // While a new tab or search is asked, the previous rows stay on screen narrowed to it, never another tab's rows.
  const loaded = invoices.isStandIn ? filterInvoices(invoices.data ?? [], tab, search, today) : (invoices.data ?? []);
  const isSearching = deferredSearch.trim() !== "";
  const isUnfiltered = tab === "all" && !isSearching;
  // Until the server answers, the newest invoices stand in, so the line and the counts never flash empty.
  const standIn = isUnfiltered ? loaded : [];
  const money = totals.data?.money ?? moneyLines(standIn, today);
  const counts = totals.data?.counts ?? tabCounts(standIn, today);
  const selectedId = routeId ?? loaded[0]?.id ?? null;
  const shown = useShownInvoice(routeId, selectedId);

  async function loadMore() {
    const next = await invoices.loadMore();
    // Show the first invoice just added: on the page after the last full one.
    if (!next.isError) setPageNo(Math.floor(loaded.length / pageSize) + 1);
  }

  function openInvoice(id: string | null) {
    const path = id ? invoicePath(id) : "/dashboard/invoices";
    if (path !== pathname) window.history.pushState(null, "", path);
  }
  const colourOf = (id: string) => clients.data?.find((c) => c.id === id)?.color ?? undefined;
  const empty = isUnfiltered && loaded.length === 0 && !routeId;

  return (
    <PageShell
      nav="invoices"
      title="Invoices"
      description="Every invoice you've issued, saved exactly as sent."
      actions={
        // Words with the +, like Clients' "New client" (issue 374: a lone + in the corner was a guess).
        <Button asChild variant="outline" className="h-10 gap-1.5">
          <Link href="/dashboard/invoices/new">
            <Plus /> New invoice
          </Link>
        </Button>
      }
    >
      <div className="print:hidden">
        <InvoicesDue unbilled={unbilled.data} clients={clients.data} today={today} />
      </div>
      {invoices.error && <Notice tone="danger">Couldn't load invoices: {invoices.error.message}</Notice>}
      {invoices.isLoading && <Skeleton className="h-96 w-full" />}
      {invoices.data && empty && (
        <EmptyState className="flex flex-col items-center gap-2 py-14">
          <FileText className="size-8 text-muted-foreground" />
          <p className="font-medium">No invoices yet.</p>
          <p className="text-muted-foreground text-sm">Create one from the time you've already logged.</p>
        </EmptyState>
      )}
      {invoices.data && !empty && (
        <SplitView
          view={routeId ? "detail" : "list"}
          wideList
          headerless="the split view: the invoice list and the chosen invoice, each with its own header"
          back={{ href: "/dashboard/invoices", label: "Invoices", onBack: () => openInvoice(null) }}
          list={
            <InvoiceListPane
              page={paginate(loaded, pageNo, pageSize)}
              money={money}
              counts={counts}
              tab={tab}
              onTab={(t) => {
                setTab(t);
                setPageNo(1);
              }}
              search={search}
              onSearch={(q) => {
                setSearch(q);
                setPageNo(1);
              }}
              onPage={setPageNo}
              selectedId={selectedId}
              onOpen={openInvoice}
              today={today}
              colourOf={colourOf}
              more={
                invoices.hasMore && !invoices.isStandIn
                  ? {
                      loaded: loaded.length,
                      total: isSearching ? undefined : counts[tab],
                      isLoading: invoices.isLoadingMore,
                      onLoad: () => void loadMore(),
                    }
                  : undefined
              }
              partialMonth={partialMonth(loaded, { hasMore: invoices.hasMore })}
            />
          }
        >
          <InvoicePane
            selectedId={selectedId}
            row={loaded.find((i) => i.id === selectedId)}
            shown={shown}
            today={today}
            colourOf={colourOf}
            onOpen={openInvoice}
          />
        </SplitView>
      )}
    </PageShell>
  );
}
