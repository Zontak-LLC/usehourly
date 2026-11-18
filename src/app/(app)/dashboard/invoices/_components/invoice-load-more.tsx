"use client";

import { Button } from "@/components/ui/button";

/** What the list needs to offer the next 200 invoices: how many are in, out of how many, and the button's action. */
export type LoadMore = {
  loaded: number;
  /** The tab's count from the server; left out while a search is typed (the counts do not know the search). */
  total?: number;
  isLoading: boolean;
  onLoad: () => void;
};

/** "Showing 200 of 602" and a "Load more" button, under the last row while the server holds more invoices. */
export function InvoiceLoadMore({ more }: { more: LoadMore }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 pt-2">
      <p className="text-muted-foreground text-sm tabular-nums">
        Showing {more.loaded}
        {more.total !== undefined && ` of ${more.total}`}
      </p>
      <Button type="button" variant="outline" className="h-10" busy={more.isLoading} onClick={more.onLoad}>
        Load more
      </Button>
    </div>
  );
}
