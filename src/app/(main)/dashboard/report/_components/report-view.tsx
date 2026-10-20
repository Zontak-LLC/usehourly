"use client";

import { useEffect, useState } from "react";

import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadAnnualXlsx } from "@/lib/export-annual-xlsx";
import { trpc } from "@/lib/trpc";

import { ReportBody } from "./report-body";

export function ReportView() {
  // "This year" comes from the browser clock (the Worker runs in UTC).
  const [year, setYear] = useState<number | null>(null);
  const [today, setToday] = useState<number | null>(null);
  useEffect(() => {
    const y = new Date().getFullYear();
    setYear(y);
    setToday(y);
  }, []);

  const me = trpc.account.me.useQuery();
  const report = trpc.report.annual.useQuery({ year: year ?? 2000 }, { enabled: year !== null });
  const [exporting, setExporting] = useState(false);

  if (year === null) return <Skeleton className="mx-auto h-96 w-full max-w-5xl" />;
  const data = report.data;

  async function exportXlsx() {
    if (!data) return;
    setExporting(true);
    try {
      await downloadAnnualXlsx(data, {
        name: me.data?.business_name ?? me.data?.name ?? null,
        ein: me.data?.ein ?? null,
        currency: me.data?.currency,
      });
    } catch (err) {
      toast.error(err instanceof Error ? `Export failed: ${err.message}` : "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <PageShell
      nav="report"
      title={<>Year summary · {year}</>}
      description="Your year at a glance, ready for your accountant or tax software."
      actions={
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-1">
          <div className="grid grid-cols-[auto_1fr_auto] gap-2 sm:flex sm:gap-1">
            <Button
              size="icon"
              variant="outline"
              className="size-10"
              onClick={() => setYear(year - 1)}
              aria-label="Previous year"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => today && setYear(today)}
              disabled={year === today}
            >
              This year
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="size-10"
              onClick={() => setYear(year + 1)}
              aria-label="Next year"
            >
              <ChevronRight />
            </Button>
          </div>
          <Button
            variant="outline"
            className="h-10 w-full sm:order-first sm:w-auto"
            onClick={exportXlsx}
            disabled={!data || exporting}
          >
            <Download /> {exporting ? "Exporting…" : "Export Excel"}
          </Button>
        </div>
      }
    >
      {report.error ? (
        <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
          Couldn't load the report: {report.error.message}
        </p>
      ) : report.isLoading || !data ? (
        <Skeleton className="h-96 w-full" />
      ) : data.totals.entryCount === 0 && data.invoices.count === 0 ? (
        <EmptyState className="py-14">No time logged or invoices issued in {year}.</EmptyState>
      ) : (
        <ReportBody data={data} year={year} />
      )}
    </PageShell>
  );
}
