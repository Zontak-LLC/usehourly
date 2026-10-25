"use client";

import { useEffect } from "react";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import { reportYear } from "@/lib/report-year";
import { trpc } from "@/lib/trpc";

/** The Year summary's loading look: shown until the view loads, and by the view until it knows the year. */
export function ReportLoading() {
  return <Skeleton className="mx-auto h-96 w-full max-w-5xl" />;
}

// Rendered in the browser only (issue 280, step 2): its data comes through tRPC there anyway, and skipping the server
// render keeps the view out of the Worker. Never import `report-view` statically here: that would put it back.
const ReportView = dynamic(() => import("./report-view").then((m) => m.ReportView), {
  ssr: false,
  loading: () => <ReportLoading />,
});

export function ReportClient() {
  // The view arrives a moment after the frame, so the frame's own queries (clients.list) would go out alone. Starting
  // the view's queries here, in the same commit, keeps the page at ONE batched request; the view then reads the cache.
  const utils = trpc.useUtils();
  useEffect(() => {
    const year = reportYear(window.location.search, new Date().getFullYear());
    void utils.account.me.prefetch();
    void utils.report.annual.prefetch({ year });
  }, [utils]);
  return <ReportView />;
}
