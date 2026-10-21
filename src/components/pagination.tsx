"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Page } from "@/lib/paginate";

/** Previous / Next with "4 to 6 of 12" between them. Renders nothing when everything fits on one page. */
export function Pagination({
  page,
  noun,
  onPage,
}: {
  page: Pick<Page<unknown>, "page" | "pages" | "from" | "to" | "total">;
  /** What the list holds, plural: "invoices". */
  noun: string;
  onPage: (next: number) => void;
}) {
  if (page.pages <= 1) return null;
  return (
    <nav aria-label={`${noun} pages`} className="flex items-center justify-between gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11 min-w-24"
        disabled={page.page <= 1}
        onClick={() => onPage(page.page - 1)}
      >
        <ChevronLeft /> Previous
      </Button>
      <p className="text-center text-foreground/75 text-sm tabular-nums" aria-live="polite">
        {page.from} to {page.to} of {page.total} {noun}
        <span className="block text-xs">
          Page {page.page} of {page.pages}
        </span>
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-11 min-w-24"
        disabled={page.page >= page.pages}
        onClick={() => onPage(page.page + 1)}
      >
        Next <ChevronRight />
      </Button>
    </nav>
  );
}
