import { useState } from "react";

import type { inferRouterOutputs } from "@trpc/server";

import { useMoney } from "@/components/currency-provider";
import { Button } from "@/components/ui/button";
import { PALETTE } from "@/lib/palette";
import {
  activeMonths,
  EARNED_NOTE,
  h,
  INVOICE_HEAD,
  invoiceRows,
  monthRows,
  PAYMENT_HEAD,
  PAYMENT_NOTE,
  PERIOD_HEAD,
  paymentRows,
  periodTotal,
  projectTag,
  QUARTER_NOTE,
  quarterRows,
} from "@/lib/year-summary-rows";
import type { AppRouter } from "@/server/routers/_app";

import { Section, Table } from "./report-table";
import { YearChart, YearFigures } from "./year-visuals";

export type AnnualReport = inferRouterOutputs<AppRouter>["report"]["annual"];

/** Phones: "Billable 12:30 · Received $800.00" under the month, skipping empty figures. */
const periodDetail = (r: string[]) =>
  [r[1] !== "–" && `${r[1]} worked`, r[2] !== "–" && `${r[2]} billable`, r[4] !== "–" && `${r[4]} received`]
    .filter(Boolean)
    .join(" · ") || "Nothing logged";

function PeriodSections({ data }: { data: AnnualReport }) {
  const money = useMoney();
  const [allMonths, setAllMonths] = useState(false);
  // Months with nothing in them only bury the real ones; "Show all 12 months" brings them back.
  const active = activeMonths(data);
  const shownMonths = allMonths || active.length === 0 ? data.months : active;
  const hidden = data.months.length - shownMonths.length;
  return (
    <>
      <Section
        title="By quarter"
        note={QUARTER_NOTE}
        foldId="quarters"
        summary={`${money(data.totals.earnedCents)} earned`}
      >
        <Table
          head={["Quarter", ...PERIOD_HEAD]}
          rows={quarterRows(data, money)}
          total={periodTotal(data, money)}
          phoneSummary={{ valueIndex: 3, detail: periodDetail }}
        />
      </Section>

      <Section title="By month" foldId="months" summary={`${money(data.totals.earnedCents)} earned`}>
        <Table
          head={["Month", ...PERIOD_HEAD]}
          rows={monthRows(shownMonths, money)}
          total={periodTotal(data, money)}
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

/** Name, hours, money: the grid every client and project row uses. */
const ROW = "grid grid-cols-[minmax(0,1fr)_4.5rem_6.5rem] items-baseline gap-x-3";

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
            {/* Client and project rows share two right-aligned columns (hours, money), so the figures line up. */}
            <div className={ROW}>
              <p className="min-w-0 font-medium">{c.client}</p>
              <p className="text-right font-mono font-semibold text-sm tabular-nums">{h(c.minutes)}</p>
              <p className="text-right font-mono font-semibold text-sm tabular-nums">
                {c.earnedCents ? money(c.earnedCents) : <span className="font-normal text-muted-foreground">–</span>}
              </p>
            </div>
            <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(c.minutes / Math.max(1, ...data.clients.map((x) => x.minutes))) * 100}%`,
                  background: PALETTE.soft,
                }}
              />
            </div>
            <ul className="mt-2 space-y-0.5">
              {data.projects
                .filter((p) => p.clientId === c.clientId)
                .map((p) => (
                  <li key={p.projectId} className={`${ROW} text-sm`}>
                    <span className="min-w-0 text-muted-foreground">
                      {p.project}
                      <span className={`ml-2 text-xs ${p.billable && p.rateCents === 0 ? "text-amber-600" : ""}`}>
                        {projectTag(p, money)}
                      </span>
                    </span>
                    <span className="text-right font-mono text-muted-foreground tabular-nums">{h(p.minutes)}</span>
                    <span className="text-right font-mono text-muted-foreground tabular-nums">
                      {p.billable && p.earnedCents ? money(p.earnedCents) : "–"}
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
            head={INVOICE_HEAD}
            rows={invoiceRows(data, money)}
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
          note={PAYMENT_NOTE}
        >
          <Table
            textCols={3}
            head={PAYMENT_HEAD}
            rows={paymentRows(data, money)}
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
      {/* The year at a glance: what came in and what is still owed, then month by month. */}
      <YearFigures data={data} year={year} />
      <YearChart data={data} />
      <div className="flex min-w-0 flex-col gap-4">
        <PeriodSections data={data} />
        <ClientProjectSection data={data} />
        <InvoiceSections data={data} year={year} />
      </div>

      <p className="text-muted-foreground text-xs">{EARNED_NOTE}</p>
    </>
  );
}
