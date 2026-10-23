"use client";

import { useState } from "react";

import { Download, Printer } from "lucide-react";
import { toast } from "sonner";

import { DocButton } from "@/components/doc-button";
import { Button } from "@/components/ui/button";
import type { InvoiceSnapshot } from "@/lib/invoice";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";

/** The client can save the invoice as a PDF (made in their browser from the frozen copy) or print the page. */
export function InvoiceDocActions({ snapshot }: { snapshot: InvoiceSnapshot }) {
  const [busy, setBusy] = useState(false);

  async function pdf() {
    setBusy(true);
    try {
      await downloadInvoicePdf(snapshot);
    } catch (err) {
      toast.error(err instanceof Error ? `Couldn't make the PDF: ${err.message}` : "Couldn't make the PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <DocButton
        onClick={pdf}
        disabled={busy}
        busy={busy}
        icon={<Download />}
        title={busy ? "Making the PDF…" : "Download PDF"}
        hint="A clean copy to keep"
        label={busy ? "Making the PDF…" : "Download PDF"}
      />
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Printer /> Print
      </Button>
    </div>
  );
}
