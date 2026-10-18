"use client";

import { useEffect, useState } from "react";

import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDecimalHours } from "@/lib/duration";
import { downloadAnnualXlsx } from "@/lib/export-annual-xlsx";
import { formatMoney } from "@/lib/invoice";
import { trpc } from "@/lib/trpc";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

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
  const h = (m: number) => `${formatDecimalHours(m)} h`;

  async function exportXlsx() {
    if (!data) return;
    setExporting(true);
    try {
      await downloadAnnualXlsx(data, {
        name: me.data?.business_name ?? me.data?.name ?? null,
        ein: me.data?.ein ?? null,
      });
    } catch (err) {
      toast.error(err instanceof Error ? `Export failed: ${err.message}` : "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-semibold text-xl">Year summary · {year}</h1>
          <p className="text-muted-foreground text-sm">
            Your year at a glance, ready for your accountant or tax software.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-1">
          <div className="grid grid-cols-[auto_1fr_auto] gap-2 sm:flex sm:gap-1">
            <Button size="icon" variant="outline" onClick={() => setYear(year - 1)} aria-label="Previous year">
              <ChevronLeft />
            </Button>
            <Button variant="outline" onClick={() => today && setYear(today)} disabled={year === today}>
              This year
            </Button>
            <Button size="icon" variant="outline" onClick={() => setYear(year + 1)} aria-label="Next year">
              <ChevronRight />
            </Button>
          </div>
          <Button
            variant="outline"
            className="w-full sm:order-first sm:w-auto"
            onClick={exportXlsx}
            disabled={!data || exporting}
          >
            <Download /> {exporting ? "Exporting…" : "Export Excel"}
          </Button>
        </div>
      </div>

      {report.error ? (
        <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
          Couldn't load the report: {report.error.message}
        </p>
      ) : report.isLoading || !data ? (
        <Skeleton className="h-96 w-full" />
      ) : data.totals.entryCount === 0 && data.invoices.count === 0 ? (
        <p className="rounded-xl border border-dashed py-14 text-center text-muted-foreground text-sm">
          No time logged or invoices issued in {year}.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat
              label="Hours worked"
              value={h(data.totals.minutes)}
              hint={`${data.totals.workedDays} ${data.totals.workedDays === 1 ? "day" : "days"}`}
            />
            <Stat
              label="Billable hours"
              value={h(data.totals.billableMinutes)}
              hint={data.totals.nonBillableMinutes ? `${h(data.totals.nonBillableMinutes)} non-billable` : undefined}
            />
            <Stat label="Earned" value={formatMoney(data.totals.earnedCents)} hint="billable hours × rate" />
            <Stat
              label="Invoiced"
              value={formatMoney(data.invoices.totalCents)}
              hint={`${data.invoices.count} invoice${data.invoices.count === 1 ? "" : "s"} issued`}
            />
            <Stat
              label="Received"
              value={formatMoney(data.received.totalCents)}
              hint={`${data.received.count} payment${data.received.count === 1 ? "" : "s"} · by paid date`}
            />
            <Stat
              label="Outstanding"
              value={formatMoney(data.outstanding.totalCents)}
              hint={`${data.outstanding.count} unpaid at year end`}
            />
          </div>

          <Section title="By quarter" note="Handy for quarterly estimated tax payments.">
            <Table
              head={["Quarter", "Hours", "Billable", "Earned", "Received"]}
              rows={data.quarters.map((q) => [
                `Q${q.quarter} · ${MONTHS[(q.quarter - 1) * 3].slice(0, 3)}–${MONTHS[q.quarter * 3 - 1].slice(0, 3)}`,
                h(q.minutes),
                h(q.billableMinutes),
                formatMoney(q.earnedCents),
                q.receivedCents ? formatMoney(q.receivedCents) : "–",
              ])}
              total={[
                "Total",
                h(data.totals.minutes),
                h(data.totals.billableMinutes),
                formatMoney(data.totals.earnedCents),
                formatMoney(data.received.totalCents),
              ]}
            />
          </Section>

          <Section title="By month">
            <Table
              head={["Month", "Hours", "Billable", "Earned", "Received"]}
              rows={data.months.map((m) => [
                MONTHS[m.month - 1],
                m.minutes ? h(m.minutes) : "–",
                m.billableMinutes ? h(m.billableMinutes) : "–",
                m.earnedCents ? formatMoney(m.earnedCents) : "–",
                m.receivedCents ? formatMoney(m.receivedCents) : "–",
              ])}
              total={[
                "Total",
                h(data.totals.minutes),
                h(data.totals.billableMinutes),
                formatMoney(data.totals.earnedCents),
                formatMoney(data.received.totalCents),
              ]}
            />
          </Section>

          <Section title="By client and project">
            <div className="divide-y">
              {data.clients.map((c) => (
                <div key={c.clientId} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-medium">{c.client}</p>
                    <p className="font-mono text-sm tabular-nums">
                      <span className="text-muted-foreground">{h(c.minutes)} · </span>
                      <span className="font-medium">{formatMoney(c.earnedCents)}</span>
                    </p>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {data.projects
                      .filter((p) => p.clientId === c.clientId)
                      .map((p) => (
                        <li key={p.projectId} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                          <span className="text-muted-foreground">
                            {p.project}
                            {!p.billable && <span className="ml-2 text-xs">non-billable</span>}
                            {p.billable && p.rateCents > 0 && (
                              <span className="ml-2 text-xs">{formatMoney(p.rateCents)}/h</span>
                            )}
                            {p.billable && p.rateCents === 0 && (
                              <span className="ml-2 text-amber-600 text-xs">no rate set</span>
                            )}
                          </span>
                          <span className="font-mono tabular-nums">
                            {h(p.minutes)}
                            <span className="ml-3">{p.billable ? formatMoney(p.earnedCents) : "–"}</span>
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          {data.invoices.count > 0 && (
            <Section title={`Invoices issued in ${year}`}>
              <Table
                textCols={3}
                head={["Invoice", "Client", "Issued", "Total", "Paid on"]}
                rows={data.invoices.list.map((i) => [
                  i.number,
                  i.client_name,
                  i.issue_date,
                  formatMoney(i.total_cents),
                  i.paid_date ?? "Unpaid",
                ])}
                total={["Total", "", "", formatMoney(data.invoices.totalCents), ""]}
              />
            </Section>
          )}

          {data.received.count > 0 && (
            <Section
              title={`Payments received in ${year}`}
              note="By the date the money arrived, including invoices issued in an earlier year."
            >
              <Table
                textCols={3}
                head={["Invoice", "Client", "Paid on", "Amount"]}
                rows={data.received.list.map((i) => [
                  i.number,
                  i.client_name,
                  i.paid_date ?? "",
                  formatMoney(i.total_cents),
                ])}
                total={["Total", "", "", formatMoney(data.received.totalCents)]}
              />
            </Section>
          )}

          <p className="text-muted-foreground text-xs">
            “Earned” is billable hours × each project's current hourly rate: what the time is worth. “Received” is the
            invoices you marked as paid, by the date they were paid. Mark invoices paid on the Invoices page to keep it
            accurate, and check it against your bank deposits before filing. This is a summary of your own records, not
            tax advice.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-mono font-semibold text-lg tabular-nums sm:text-xl">{value}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-base">{title}</h2>
        {note && <p className="text-muted-foreground text-xs">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** `textCols` = how many leading columns are text (left-aligned); the rest are numbers. */
function Table({
  head,
  rows,
  total,
  textCols = 1,
}: {
  head: string[];
  rows: string[][];
  total?: string[];
  textCols?: number;
}) {
  const align = (i: number) => (i < textCols ? "" : "text-right font-mono tabular-nums");
  return (
    <>
      {/* Phones: one small card per row, with a label beside each value. */}
      <ul className="divide-y sm:hidden">
        {rows.map((r) => (
          <li key={r.join("|")} className="px-4 py-3">
            <p className="font-medium">{r[0]}</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {r.slice(1).map((c, k) => (
                <div key={`${r[0]}-${head[k + 1]}`} className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">{head[k + 1]}</dt>
                  <dd className={k + 1 < textCols ? "text-right" : "text-right font-mono tabular-nums"}>{c}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
        {total && (
          <li className="bg-muted/40 px-4 py-3">
            <p className="font-medium">{total[0]}</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {total.slice(1).map((c, k) =>
                c ? (
                  <div key={`t-${head[k + 1]}`} className="flex items-baseline justify-between gap-2">
                    <dt className="text-muted-foreground">{head[k + 1]}</dt>
                    <dd className="text-right font-medium font-mono tabular-nums">{c}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          </li>
        )}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              {head.map((c, i) => (
                <th key={c} className={`px-4 py-2 font-normal ${i < textCols ? "" : "text-right"}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.join("|")} className="border-b last:border-0">
                {r.map((c, i) => (
                  <td key={`${r[0]}-${head[i]}`} className={`px-4 py-2 ${align(i)}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {total && (
            <tfoot>
              <tr className="border-t bg-muted/40 font-medium">
                {total.map((c, i) => (
                  <td key={`t-${head[i]}`} className={`px-4 py-2 ${align(i)}`}>
                    {c}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
