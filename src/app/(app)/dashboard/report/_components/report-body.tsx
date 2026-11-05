import { type ReactNode, useState } from "react";

import type { inferRouterOutputs } from "@trpc/server";
import { Banknote, CalendarDays, CalendarRange, FileText, Grid2x2, Receipt, Users } from "lucide-react";

import { useMoney } from "@/components/currency-provider";
import { SectionSplit, SplitPane } from "@/components/split-view";
import { Button } from "@/components/ui/button";
import { PALETTE } from "@/lib/palette";
import { type ExpenseFacts, type YearSectionId, yearSectionFacts, yearSections } from "@/lib/year-sections";
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

import { Table } from "./report-table";
import { YearChart, YearFigures } from "./year-visuals";

export type AnnualReport = inferRouterOutputs<AppRouter>["report"]["annual"];

/** Phones: "Billable 12:30 · Received $800.00" under the month, skipping empty figures. */
const periodDetail = (r: string[]) =>
  [r[1] !== "–" && `${r[1]} worked`, r[2] !== "–" && `${r[2]} billable`, r[4] !== "–" && `${r[4]} received`]
    .filter(Boolean)
    .join(" · ") || "Nothing logged";

function QuarterTable({ data }: { data: AnnualReport }) {
  const money = useMoney();
  return (
    <Table
      head={["Quarter", ...PERIOD_HEAD]}
      rows={quarterRows(data, money)}
      total={periodTotal(data, money)}
      phoneSummary={{ valueIndex: 3, detail: periodDetail }}
    />
  );
}

function MonthTable({ data }: { data: AnnualReport }) {
  const money = useMoney();
  const [allMonths, setAllMonths] = useState(false);
  // Months with nothing in them only bury the real ones; "Show all 12 months" brings them back.
  const active = activeMonths(data);
  const shownMonths = allMonths || active.length === 0 ? data.months : active;
  const hidden = data.months.length - shownMonths.length;
  return (
    <>
      <Table
        head={["Month", ...PERIOD_HEAD]}
        rows={monthRows(shownMonths, money)}
        total={periodTotal(data, money)}
        phoneSummary={{ valueIndex: 3, detail: periodDetail }}
      />
      {(hidden > 0 || allMonths) && active.length > 0 && (
        <div className="border-t px-4 py-2 print:hidden">
          <Button type="button" variant="ghost" size="sm" onClick={() => setAllMonths((v) => !v)}>
            {allMonths ? "Show only months with activity" : `Show all 12 months (${hidden} with nothing)`}
          </Button>
        </div>
      )}
    </>
  );
}

/** Name, hours, money: the grid every client and project row uses. */
const ROW = "grid grid-cols-[minmax(0,1fr)_4.5rem_6.5rem] items-baseline gap-x-3";

function ClientProjectList({ data }: { data: AnnualReport }) {
  const money = useMoney();
  if (data.clients.length === 0) return <Nothing>No time logged in {data.year}.</Nothing>;
  return (
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
  );
}

function InvoiceTable({ data }: { data: AnnualReport }) {
  const money = useMoney();
  if (data.invoices.count === 0) return <Nothing>No invoices issued in {data.year}.</Nothing>;
  return (
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
  );
}

function PaymentTable({ data }: { data: AnnualReport }) {
  const money = useMoney();
  if (data.received.count === 0) return <Nothing>No payments received in {data.year}.</Nothing>;
  return (
    <Table
      textCols={3}
      head={PAYMENT_HEAD}
      rows={paymentRows(data, money)}
      phoneSummary={{ valueIndex: 3, detail: (r) => [r[1], r[2] && `paid ${r[2]}`].filter(Boolean).join(" · ") }}
      total={["Total", "", "", money(data.received.totalCents)]}
    />
  );
}

/** An empty section says so in one plain line (no dashed box: it would be a card inside the split card). */
function Nothing({ children }: { children: ReactNode }) {
  return <p className="px-4 py-2 text-muted-foreground text-sm">{children}</p>;
}

const ICONS = {
  year: CalendarRange,
  quarters: Grid2x2,
  months: CalendarDays,
  clients: Users,
  invoices: FileText,
  payments: Banknote,
  expenses: Receipt,
} as const;

const NOTES: Partial<Record<YearSectionId, string>> = {
  quarters: QUARTER_NOTE,
  payments: PAYMENT_NOTE,
  expenses: "What you spent for your work, and trips at a rate per mile.",
};

/**
 * The Year summary as a split view like Account: the sections on the left, each with one line and its key figure, and
 * the open one (the address's #part) on the right. Every section is drawn, the others hidden, so printing the page
 * prints the whole year (accountants print it).
 */
export function YearSplit({
  data,
  year,
  open,
  expenses,
}: {
  data: AnnualReport;
  year: number;
  open: YearSectionId | null;
  /** The Expenses section and its list facts, only while the feature is on. */
  expenses?: { facts: ExpenseFacts; node: ReactNode };
}) {
  const money = useMoney();
  const facts = yearSectionFacts(data, money, expenses?.facts);
  const sections = yearSections(Boolean(expenses));
  const selected = open ?? "year";
  const body: Record<YearSectionId, ReactNode> = {
    // The year at a glance: what came in and what is still owed, then month by month.
    year: (
      <div className="flex flex-col gap-4 px-4">
        <YearFigures data={data} year={year} />
        <YearChart data={data} />
        <p className="text-muted-foreground text-xs">{EARNED_NOTE}</p>
      </div>
    ),
    quarters: <QuarterTable data={data} />,
    months: <MonthTable data={data} />,
    clients: <ClientProjectList data={data} />,
    invoices: <InvoiceTable data={data} />,
    payments: <PaymentTable data={data} />,
    expenses: expenses?.node,
  };
  return (
    <SectionSplit
      label="Year summary sections"
      sections={sections.map((s) => ({ ...s, ...facts[s.id], icon: ICONS[s.id] }))}
      open={open}
      fallback="year"
      headerless="the split view: the Year summary sections and the chosen one, which has its own heading"
      back={{ href: "/dashboard/report", label: "Year summary" }}
      detailClassName="py-3 sm:py-5"
    >
      {sections.map((s) => (
        <SplitPane
          key={s.id}
          id={`year-${s.id}`}
          title={s.label}
          description={NOTES[s.id]}
          headClassName="px-4 pb-3"
          className={s.id === selected ? "print:mb-8" : "hidden print:mb-8 print:block"}
        >
          {body[s.id]}
        </SplitPane>
      ))}
    </SectionSplit>
  );
}
