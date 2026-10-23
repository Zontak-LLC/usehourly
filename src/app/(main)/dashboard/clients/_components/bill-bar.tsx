"use client";

import Link from "next/link";

import { useMoney } from "@/components/currency-provider";
import { Button } from "@/components/ui/button";
import { billBarDetail } from "@/lib/client-list";
import type { Unbilled } from "@/lib/unbilled";

/**
 * The bill bar (issue 238, variation B): pinned to the foot of the client's profile while it scrolls, like a checkout
 * bar. One line of money ("$1,072.50 not invoiced"), one line of when ("11:30 h from Oct 9 to Oct 22 · oldest day 14
 * days ago") and Make invoice at its right end. Shown only when the client has time to bill. On a phone it sits just
 * above the bottom tab bar.
 *
 * Make invoice is the page's one solid button; while a form with its own Save is open in the profile, it steps down to
 * an outline so the screen still has one main action.
 */
export function BillBar({
  clientId,
  clientName,
  unbilled,
  today,
  quiet,
}: {
  clientId: string;
  clientName: string;
  unbilled: Unbilled;
  today: string | null;
  /** A form is open in the profile: the button is an outline, not the solid main action. */
  quiet: boolean;
}) {
  const money = useMoney();
  return (
    <div
      data-testid="bill-bar"
      className="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-card/90 px-4 py-3 backdrop-blur max-md:bottom-[calc(5rem+env(safe-area-inset-bottom))] max-md:rounded-b-xl max-md:shadow-[var(--shadow-sheet)]"
    >
      <p className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{money(unbilled.cents)} not invoiced</span>
        <span className="text-foreground/70 text-sm">{billBarDetail(unbilled, today)}</span>
      </p>
      <Button asChild variant={quiet ? "outline" : "primary"} className="h-11 px-5 max-sm:w-full">
        <Link href={`/dashboard/invoices/new?client=${clientId}`} aria-label={`Make an invoice for ${clientName}`}>
          Make invoice
        </Link>
      </Button>
    </div>
  );
}
