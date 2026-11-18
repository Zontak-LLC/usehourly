import type { Metadata } from "next";

import { ArchivedView } from "../_components/archived-view";

export const metadata: Metadata = { title: "Archived · UseHourly" };

export default function ArchivedPage() {
  return <ArchivedView />;
}
