import type { Metadata } from "next";

import { ReportView } from "./_components/report-view";

export const metadata: Metadata = { title: "Year summary · UseHourly" };

export default function ReportPage() {
  return <ReportView />;
}
