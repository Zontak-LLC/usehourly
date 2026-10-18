import type { inferRouterOutputs } from "@trpc/server";

import { formatDecimalHours } from "@/lib/duration";
import { formatMoney } from "@/lib/invoice";
import type { AppRouter } from "@/server/routers/_app";

import { Section, Stat, Table } from "./report-table";

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

function ReportStats({ data }: { data: AnnualReport }) {
  return (
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
  );
}

function totalsRow(data: AnnualReport): string[] {
  return [
    "Total",
    h(data.totals.minutes),
    h(data.totals.billableMinutes),
    formatMoney(data.totals.earnedCents),
    formatMoney(data.received.totalCents),
  ];
}

function PeriodSections({ data }: { data: AnnualReport }) {
  return (
    <>
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
          total={totalsRow(data)}
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
          total={totalsRow(data)}
        />
      </Section>
    </>
  );
}

function ClientProjectSection({ data }: { data: AnnualReport }) {
  return (
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
  );
}

function InvoiceSections({ data, year }: { data: AnnualReport; year: number }) {
  return (
    <>
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
    </>
  );
}

export function ReportBody({ data, year }: { data: AnnualReport; year: number }) {
  return (
    <>
      <ReportStats data={data} />
      <PeriodSections data={data} />
      <ClientProjectSection data={data} />
      <InvoiceSections data={data} year={year} />

      <p className="text-muted-foreground text-xs">
        “Earned” is billable hours × each project's current hourly rate: what the time is worth. “Received” is the
        invoices you marked as paid, by the date they were paid. Mark invoices paid on the Invoices page to keep it
        accurate, and check it against your bank deposits before filing. This is a summary of your own records, not tax
        advice.
      </p>
    </>
  );
}
