"use client";

import { useState } from "react";

import { Download, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { InvoiceSnapshot } from "@/lib/invoice";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";

/** The client can save the invoice as a PDF (made in their browser from the frozen copy) or print the page. */
export function InvoiceActions({ snapshot }: { snapshot: InvoiceSnapshot }) {
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
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button type="button" onClick={pdf} disabled={busy}>
        <Download /> {busy ? "Making the PDF…" : "Download PDF"}
      </Button>
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Printer /> Print
      </Button>
    </div>
  );
}
