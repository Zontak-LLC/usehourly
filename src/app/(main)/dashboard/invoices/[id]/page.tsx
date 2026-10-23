import type { Metadata } from "next";

import { InvoiceView } from "./_components/invoice-view";

export const metadata: Metadata = { title: "Invoice · UseHourly" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceView id={id} />;
}
