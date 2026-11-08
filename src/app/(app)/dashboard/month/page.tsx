import type { Metadata } from "next";

import { MonthView } from "./_components/month-view";

export const metadata: Metadata = { title: "Month · UseHourly" };

export default async function MonthPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  // The month, the day and the view (`?month=YYYY-MM&date=YYYY-MM-DD&view=month`) are read in the page itself, so Back
  // and a reload keep them (lib/month-address.ts).
  return <MonthView initialProject={project} />;
}
