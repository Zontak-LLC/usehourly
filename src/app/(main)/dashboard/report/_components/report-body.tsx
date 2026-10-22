import { useState } from "react";

import type { inferRouterOutputs } from "@trpc/server";

import { useMoney } from "@/components/currency-provider";
import { Button } from "@/components/ui/button";
import { formatDecimalHours } from "@/lib/duration";
import type { AppRouter } from "@/server/routers/_app";

import { Section, Table } from "./report-table";
import { YearChart, YearDial, YearFigures } from "./year-visuals";

export type AnnualReport = inferRouterOutputs<AppRouter>["report"]["annual"];

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

const h = (m: number) => `${formatDecimalHours(m)} h`;
/** An empty figure is always "–" (never "0.00 h" in one table and "–" in another). */
const hOrDash = (m: number) => (m ? h(m) : "–");

/** Phones: "Billable 12.50 h · Received $800.00" under the month, skipping empty figures. */
const periodDetail = (r: string[]) =>
  [r[1] !== "–" && `${r[1]} worked`, r[2] !== "–" && `${r[2]} billable`, r[4] !== "–" && `${r[4]} received`]
    .filter(Boolean)
    .join(" · ") || "Nothing logged";

function totalsRow(data: AnnualReport, money: (cents: number) => string): string[] {
  return [
    "Total",
    h(data.totals.minutes),
    h(data.totals.billableMinutes),
    money(data.totals.earnedCents),
    money(data.received.totalCents),
  ];
}

function PeriodSections({ data }: { data: AnnualReport }) {
  const money = useMoney();
  const [allMonths, setAllMonths] = useState(false);
  // Months with nothing in them only bury the real ones; "Show all 12 months" brings them back.
  const active = data.months.filter((m) => m.minutes || m.earnedCents || m.receivedCents);
  const shownMonths = allMonths || active.length === 0 ? data.months : active;
  const hidden = data.months.length - shownMonths.length;
  return (
    <>
      <Section
        title="By quarter"
        note="Handy for quarterly estimated tax payments."
        foldId="quarters"
        summary={`${money(data.totals.earnedCents)} earned`}
      >
        <Table
          head={["Quarter", "Hours", "Billable", "Earned", "Received"]}
          rows={data.quarters.map((q) => [
            `Q${q.quarter} · ${MONTHS[(q.quarter - 1) * 3].slice(0, 3)}–${MONTHS[q.quarter * 3 - 1].slice(0, 3)}`,
            hOrDash(q.minutes),
            hOrDash(q.billableMinutes),
            q.earnedCents ? money(q.earnedCents) : "–",
            q.receivedCents ? money(q.receivedCents) : "–",
          ])}
          total={totalsRow(data, money)}
          phoneSummary={{ valueIndex: 3, detail: periodDetail }}
        />
      </Section>

      <Section title="By month" foldId="months" summary={`${money(data.totals.earnedCents)} earned`}>
        <Table
          head={["Month", "Hours", "Billable", "Earned", "Received"]}
          rows={shownMonths.map((m) => [
            MONTHS[m.month - 1],
            hOrDash(m.minutes),
            hOrDash(m.billableMinutes),
            m.earnedCents ? money(m.earnedCents) : "–",
            m.receivedCents ? money(m.receivedCents) : "–",
          ])}
          total={totalsRow(data, money)}
          phoneSummary={{ valueIndex: 3, detail: periodDetail }}
        />
        {(hidden > 0 || allMonths) && active.length > 0 && (
          <div className="border-t px-4 py-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAllMonths((v) => !v)}>
              {allMonths ? "Show only months with activity" : `Show all 12 months (${hidden} with nothing)`}
            </Button>
          </div>
        )}
      </Section>
    </>
  );
}

function ClientProjectSection({ data }: { data: AnnualReport }) {
  const money = useMoney();
  return (
    <Section
      title="By client and project"
      foldId="clients"
      summary={`${data.clients.length} client${data.clients.length === 1 ? "" : "s"}`}
    >
      <div className="divide-y">
        {data.clients.map((c) => (
          <div key={c.clientId} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="font-medium">{c.client}</p>
              <p className="font-mono text-sm tabular-nums">
                <span className="text-muted-foreground">{h(c.minutes)} · </span>
                <span className="font-medium">{money(c.earnedCents)}</span>
              </p>
            </div>
            <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber to-[color-mix(in_oklab,var(--amber)_60%,white)]"
                style={{ width: `${(c.minutes / Math.max(1, ...data.clients.map((x) => x.minutes))) * 100}%` }}
              />
            </div>
            <ul className="mt-2 space-y-0.5">
              {data.projects
                .filter((p) => p.clientId === c.clientId)
                .map((p) => (
                  <li key={p.projectId} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="text-muted-foreground">
                      {p.project}
                      {!p.billable && <span className="ml-2 text-xs">non-billable</span>}
                      {p.billable && p.rateCents > 0 && <span className="ml-2 text-xs">{money(p.rateCents)}/h</span>}
                      {p.billable && p.rateCents === 0 && (
                        <span className="ml-2 text-amber-600 text-xs">no rate set</span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums">
                      {h(p.minutes)}
                      <span className="ml-3">{p.billable ? money(p.earnedCents) : "–"}</span>
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

function InvoiceSections({ data, year }: { data: AnnualReport; year: number }) {
  const money = useMoney();
  return (
    <>
      {data.invoices.count > 0 && (
        <Section
          title={`Invoices issued in ${year}`}
          foldId="invoices"
          summary={`${data.invoices.count} · ${money(data.invoices.totalCents)}`}
        >
          <Table
            textCols={3}
            head={["Invoice", "Client", "Issued", "Total", "Paid on"]}
            rows={data.invoices.list.map((i) => [
              i.number,
              i.client_name,
              i.issue_date,
              money(i.total_cents),
              i.paid_date ?? "Unpaid",
            ])}
            total={["Total", "", "", money(data.invoices.totalCents), ""]}
            phoneSummary={{
              valueIndex: 3,
              detail: (r) =>
                [r[1] && r[1], r[2] && `issued ${r[2]}`, r[4] && r[4] !== "Unpaid" ? `paid ${r[4]}` : r[4]]
                  .filter(Boolean)
                  .join(" · "),
            }}
          />
        </Section>
      )}

      {data.received.count > 0 && (
        <Section
          title={`Payments received in ${year}`}
          foldId="payments"
          summary={`${data.received.count} · ${money(data.received.totalCents)}`}
          note="By the date the money arrived, including invoices issued in an earlier year."
        >
          <Table
            textCols={3}
            head={["Invoice", "Client", "Paid on", "Amount"]}
            rows={data.received.list.map((i) => [i.number, i.client_name, i.paid_date ?? "", money(i.total_cents)])}
            phoneSummary={{ valueIndex: 3, detail: (r) => [r[1], r[2] && `paid ${r[2]}`].filter(Boolean).join(" · ") }}
            total={["Total", "", "", money(data.received.totalCents)]}
          />
        </Section>
      )}
    </>
  );
}

export function ReportBody({ data, year }: { data: AnnualReport; year: number }) {
  return (
    <>
      {/* The year at a glance: the dial and its goal slider on the left, the six figures and a month-by-month chart beside it. */}
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <YearDial data={data} year={year} />
        <div className="min-w-0">
          <YearFigures data={data} />
        </div>
      </div>
      <YearChart data={data} />
      <div className="flex min-w-0 flex-col gap-4">
        <PeriodSections data={data} />
        <ClientProjectSection data={data} />
        <InvoiceSections data={data} year={year} />
      </div>

      <p className="text-muted-foreground text-xs">
        “Earned” is billable hours × each project's current hourly rate: what the time is worth. “Received” is the
        invoices you marked as paid, by the date they were paid. Mark invoices paid on the Invoices page to keep it
        accurate, and check it against your bank deposits before filing. This is a summary of your own records, not tax
        advice.
      </p>
    </>
  );
}
