"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { FileText, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const HIDE_KEY = "hourly:hideBillHint";

/**
 * Shown once there is time logged: points at the next step (billing) so nobody has to hunt the
 * menu for invoices. Dismissing it is remembered on this device only.
 */
export function BillHint() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDE_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {
      // Remembering the dismissal is a convenience; the card just returns next visit.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
      <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 flex-1 basis-40 text-sm">
        <span className="font-medium">Nice work.</span> Ready to get paid? Turn your hours into an invoice.
      </p>
      <Button asChild className="h-11 shrink-0">
        <Link href="/dashboard/invoices/new">Make an invoice</Link>
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-11 shrink-0"
        onClick={dismiss}
        aria-label="Hide this tip"
      >
        <X />
      </Button>
    </div>
  );
}
