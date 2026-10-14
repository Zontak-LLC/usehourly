import type { Metadata } from "next";

import { InvoicesView } from "./_components/invoices-view";

export const metadata: Metadata = { title: "Invoices · UseHourly" };

export default function InvoicesPage() {
  return <InvoicesView />;
}
