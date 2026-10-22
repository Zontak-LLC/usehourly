"use client";

import { CardTitle } from "@/components/card-title";
import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

import { SupportNoticeCard } from "./support-notice-card";

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-3xl border bg-card px-4 py-4 shadow-[var(--shadow-sheet)]">
      <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">{label}</span>
      <span className="font-display font-extrabold text-5xl tabular-nums leading-none">{value}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
  );
}

/** Columns for a short series (weeks, days): the tallest is the scale, the latest is amber, a title says each value. */
function Columns({ items }: { items: { key: string; label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex h-40 items-end gap-1.5">
      {items.map((i, n) => (
        <div
          key={i.key}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          title={`${i.label}: ${i.value}`}
        >
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{i.value || ""}</span>
          <span
            className={`w-full rounded-t-md ${n === items.length - 1 ? "bg-amber" : "bg-foreground/20"}`}
            style={{ height: `${Math.max(i.value > 0 ? 3 : 0, (i.value / max) * 100)}%` }}
          />
          <span className="max-w-full truncate font-mono text-[9px] text-muted-foreground">{i.label.slice(-5)}</span>
        </div>
      ))}
    </div>
  );
}

/** A labelled row with a bar scaled to the largest value in its list. */
function BarRow({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  const width = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm">
      <span className="truncate text-muted-foreground">{label}</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-amber" style={{ width: `${width}%` }} />
      </div>
      <span className="min-w-8 text-right tabular-nums">
        {value}
        {suffix}
      </span>
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-sheet)]">
      <div className="border-b bg-band-2 px-4 py-3">
        <CardTitle title={title} note={note} />
      </div>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </section>
  );
}

export function InsightsView() {
  const q = trpc.insights.overview.useQuery(undefined, { staleTime: 60_000 });
  if (q.isLoading) return <Skeleton className="m-4 h-96 lg:m-6" />;
  if (q.error || !q.data) {
    return <p className="m-4 text-muted-foreground lg:m-6">Couldn't load the numbers. Try again in a moment.</p>;
  }
  const d = q.data;
  const maxPage = Math.max(0, ...d.pages.map((p) => p.views30));
  const { signedUp, withEntry, withInvoice, firstEntryWithinDay } = d.funnel;

  return (
    <PageShell
      nav="insights"
      title="Insights"
      description="Totals only: no names, emails, clients or entries appear here. Sample accounts are left out."
    >
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Tile
          label="Accounts"
          value={d.totals.users}
          hint={`${d.totals.demoAccounts} sample account${d.totals.demoAccounts === 1 ? "" : "s"} now`}
        />
        <Tile label="New, last 7 days" value={d.signups.last7} hint={`${d.signups.last30} in 30 days`} />
        <Tile label="Active, last 7 days" value={d.active.last7} hint="logged or changed time" />
        <Tile
          label="Active, last 30 days"
          value={d.active.last30}
          hint={d.entriesPerActiveUser30 === null ? "" : `${d.entriesPerActiveUser30} entries each`}
        />
      </div>

      <Card title="Do people get going?" note="Of everyone who signed up, how far they got.">
        <div className="flex flex-col gap-2">
          <BarRow label="Signed up" value={signedUp} max={signedUp} />
          <BarRow label="Logged time" value={withEntry} max={signedUp} suffix={` (${pct(withEntry, signedUp)})`} />
          <BarRow
            label="First entry in a day"
            value={firstEntryWithinDay}
            max={signedUp}
            suffix={` (${pct(firstEntryWithinDay, signedUp)})`}
          />
          <BarRow
            label="Made an invoice"
            value={withInvoice}
            max={signedUp}
            suffix={` (${pct(withInvoice, signedUp)})`}
          />
        </div>
        <p className="text-muted-foreground text-sm">
          Still around: {d.active.retention.active} of {d.active.retention.eligible} accounts older than four weeks
          touched their time this week ({pct(d.active.retention.active, d.active.retention.eligible)}).
        </p>
      </Card>

      <Card title="New accounts per week" note="Weeks start on Monday (UTC), most recent last.">
        <Columns items={d.signups.byWeek.map((w) => ({ key: w.week, label: w.week, value: w.count }))} />
      </Card>

      <Card
        title="Pages opened, last 30 days"
        note="One count each time someone opens the page. Counting began when this feature shipped."
      >
        <div className="flex flex-col gap-2">
          {d.pages.map((p) => (
            <BarRow key={p.page} label={p.label} value={p.views30} max={maxPage} />
          ))}
        </div>
      </Card>

      <Card title="Page views per day, last 14 days">
        <Columns items={d.daily.map((x) => ({ key: x.day, label: x.day, value: x.views }))} />
      </Card>
      <SupportNoticeCard />
    </PageShell>
  );
}
