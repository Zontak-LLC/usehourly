"use client";

import { keepPreviousData, skipToken } from "@tanstack/react-query";

import { flattenInvoicePages, type InvoicePageQuery } from "@/lib/invoice-pages";
import { trpc } from "@/lib/trpc";

/**
 * Invoices' history, 200 at a time (`invoice.listPage`): `data` is every loaded page as one list (undefined until the
 * first page is in), and `loadMore` reads the next page. It never reads a next page by itself: the screen's "Load more"
 * button does. A new tab or search keeps the old rows on screen until its first page is in. `undefined` asks nothing.
 */
export function useInvoicePages(input: InvoicePageQuery | undefined) {
  const query = trpc.invoice.listPage.useInfiniteQuery(input ?? skipToken, {
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
  return {
    data: query.data ? flattenInvoicePages(query.data.pages) : undefined,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: query.hasNextPage,
    loadMore: () => query.fetchNextPage(),
    isLoadingMore: query.isFetchingNextPage,
    /** True while `data` is the previous tab's or search's rows, kept on screen until the new first page is in. */
    isStandIn: query.isPlaceholderData,
  };
}
