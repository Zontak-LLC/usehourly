"use client";

import { useEffect, useRef } from "react";

import { FileCheck2 } from "lucide-react";

import { DocButton } from "@/components/doc-button";
import { InvoiceDocument } from "@/components/invoice-document";
import { Button } from "@/components/ui/button";
import type { InvoiceSnapshot } from "@/lib/invoice";

/**
 * The review step of New invoice (2026-11-06: testers expected to stop at a preview before anything was saved): the
 * invoice exactly as Save will store it (`invoice.preview` runs the same builder as `invoice.create`), then the one
 * deliberate click. Back to edit returns to the form with every field as it was.
 */
export function InvoiceReview({
  snapshot,
  saving,
  onSave,
  onBack,
}: {
  snapshot: InvoiceSnapshot;
  saving: boolean;
  onSave: () => void;
  onBack: () => void;
}) {
  const top = useRef<HTMLHeadingElement>(null);
  // Opens at its top (on a phone the button pressed was far down the form), with the keyboard focus on the heading.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    top.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h2 ref={top} tabIndex={-1} className="font-semibold text-xl outline-none">
          Check your invoice
        </h2>
        <p className="mt-1 text-base text-muted-foreground">Nothing is saved yet.</p>
      </div>
      {/* The same paper and component as the Invoices pane, full size here. */}
      <div className="paper flex flex-col gap-5 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
        <InvoiceDocument s={snapshot} paidDate={null} preview />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <DocButton
          tone="amber"
          icon={<FileCheck2 />}
          title={saving ? "Saving…" : "Save and download PDF"}
          hint="saves it to your invoices"
          label={saving ? "Saving…" : "Save and download PDF"}
          busy={saving}
          busyLabel="Saving"
          disabled={saving}
          onClick={onSave}
        />
        <Button type="button" variant="outline" className="h-12" disabled={saving} onClick={onBack}>
          Back to edit
        </Button>
      </div>
    </div>
  );
}
