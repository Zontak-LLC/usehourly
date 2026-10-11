import type { Metadata } from "next";

import { NewInvoiceView } from "./_components/new-invoice-view";

export const metadata: Metadata = { title: "New invoice · Hourly" };

export default function NewInvoicePage() {
  return <NewInvoiceView />;
}
