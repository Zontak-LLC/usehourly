import type { Metadata } from "next";

import { WeekView } from "./_components/week-view";

export const metadata: Metadata = { title: "Week · UseHourly" };

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  return <WeekView initialProject={project} />;
}
