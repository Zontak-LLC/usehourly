"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Page } from "@/lib/paginate";

/**
 * Previous / Next with "4 to 6 of 12" between them. Renders nothing when everything fits on one page. `compact` is for a
 * narrow card (Week's By project): arrow buttons (named "Previous page" / "Next page") and one line, "1–10 of 18".
 */
export function Pagination({
  page,
  noun,
  onPage,
  compact = false,
}: {
  page: Pick<Page<unknown>, "page" | "pages" | "from" | "to" | "total">;
  /** What the list holds, plural: "invoices". */
  noun: string;
  onPage: (next: number) => void;
  compact?: boolean;
}) {
  if (page.pages <= 1) return null;
  return (
    <nav aria-label={`${noun} pages`} className="flex items-center justify-between gap-2">
      <Button
        type="button"
        variant="outline"
        className={compact ? "size-10" : "h-11 min-w-24"}
        disabled={page.page <= 1}
        onClick={() => onPage(page.page - 1)}
        aria-label={compact ? "Previous page" : undefined}
      >
        <ChevronLeft /> {!compact && "Previous"}
      </Button>
      <p className="text-center text-foreground/75 text-sm tabular-nums" aria-live="polite">
        {compact ? (
          <>
            {page.from}–{page.to} of {page.total} <span className="sr-only">{noun}</span>
          </>
        ) : (
          <>
            {page.from} to {page.to} of {page.total} {noun}
            <span className="block text-xs">
              Page {page.page} of {page.pages}
            </span>
          </>
        )}
      </p>
      <Button
        type="button"
        variant="outline"
        className={compact ? "size-10" : "h-11 min-w-24"}
        disabled={page.page >= page.pages}
        onClick={() => onPage(page.page + 1)}
        aria-label={compact ? "Next page" : undefined}
      >
        {!compact && "Next"} <ChevronRight />
      </Button>
    </nav>
  );
}
