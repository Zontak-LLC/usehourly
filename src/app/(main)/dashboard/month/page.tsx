import type { Metadata } from "next";

import { MonthView } from "./_components/month-view";

export const metadata: Metadata = { title: "Month · UseHourly" };

export default async function MonthPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; project?: string }>;
}) {
  const { month, project } = await searchParams;
  // `?month=YYYY-MM` lets other pages (e.g. Today) deep-link to a specific month.
  return (
    <MonthView
      initialProject={project}
      initialMonth={month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : undefined}
    />
  );
}
