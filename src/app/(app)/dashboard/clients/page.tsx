import type { Metadata } from "next";

import { ClientsView } from "./_components/clients-view";

export const metadata: Metadata = { title: "Clients · UseHourly" };

export default function ClientsPage() {
  return <ClientsView />;
}
