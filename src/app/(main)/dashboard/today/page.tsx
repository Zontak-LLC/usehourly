import type { Metadata } from "next";

import { TodayView } from "./_components/today-view";

export const metadata: Metadata = { title: "Today · Hourly" };

export default function TodayPage() {
  return <TodayView />;
}
