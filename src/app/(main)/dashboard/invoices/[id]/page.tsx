import type { Metadata } from "next";

import { InvoicesView } from "../_components/invoices-view";
import { InvoiceView } from "./_components/invoice-view";

export const metadata: Metadata = { title: "Invoices · UseHourly" };

/**
 * One invoice: the same split view as the list, with this invoice open (it reads the id from the address).
 * `?full=1` ("Open full size") is the invoice alone, as the client sees it, with Download PDF and Print.
 */
export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ full?: string }>;
}) {
  const [{ id }, { full }] = await Promise.all([params, searchParams]);
  return full ? <InvoiceView id={id} /> : <InvoicesView />;
}
