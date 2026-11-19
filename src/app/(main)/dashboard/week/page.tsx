import type { Metadata } from "next";

import { WeekView } from "./_components/week-view";

export const metadata: Metadata = { title: "Week · UseHourly" };

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; date?: string }>;
}) {
  const { project, date } = await searchParams;
  return (
    <WeekView initialProject={project} initialDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined} />
  );
}
