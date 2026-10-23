import type { Metadata } from "next";

import { ClientsView } from "../_components/clients-view";

export const metadata: Metadata = { title: "Clients · UseHourly" };

/** One client's profile (issue 238). The same view as the list: it reads the client from the address. */
export default function ClientProfilePage() {
  return <ClientsView />;
}
