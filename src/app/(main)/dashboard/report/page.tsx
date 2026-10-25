import type { Metadata } from "next";

import { ReportClient } from "./_components/report-client";

export const metadata: Metadata = { title: "Year summary · UseHourly" };

export default function ReportPage() {
  return <ReportClient />;
}
