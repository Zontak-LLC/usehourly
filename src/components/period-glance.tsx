import { fromISODate } from "@/lib/dates";
import { DAY_COLORS } from "@/lib/day-colors";
import { formatDuration } from "@/lib/duration";
import { blendSlice } from "@/lib/line-color";

const day = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

/**
 * A small card of three plain facts about the period on screen: the busiest day, the average on the days worked, and how
 * many days had time. It sits under "By project" so the left column is as full as the right. It shows nothing when no day
 * has time.
 */
export function PeriodGlance({
  dayTotals,
  days,
  strip = false,
  from,
}: {
  dayTotals: Record<string, number>;
  days: number;
  /** The first date of the period: with it the strip can draw every day of it (a chart, a dot for each day). */
  from?: string;
  /** Three tiles in a row (for a full-width page) instead of a list in a narrow column. */
  strip?: boolean;
}) {
  const worked = Object.entries(dayTotals).filter(([, minutes]) => minutes > 0);
  if (worked.length === 0) return null;
  const [busiestDate, busiest] = worked.reduce((a, b) => (b[1] > a[1] ? b : a));
  const total = worked.reduce((sum, [, minutes]) => sum + minutes, 0);
  const facts: [string, string, string][] = [
    ["Busiest day", formatDuration(busiest), day.format(fromISODate(busiestDate))],
    ["Average on a worked day", formatDuration(Math.round(total / worked.length)), `${worked.length} days`],
    ["Days with time", `${worked.length}`, `of ${days}`],
  ];
  if (strip)
    return (
      <GlanceStrip
        facts={facts}
        dayTotals={dayTotals}
        days={days}
        from={from}
        busiestDate={busiestDate}
        avg={total / worked.length}
      />
    );
  return (
    <section
      aria-label="At a glance"
      data-headerless="three facts under the project list"
      className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-sheet)]"
    >
      <h2 className="px-4 pt-4 pb-2 font-mono font-normal text-[11px] text-muted-foreground uppercase tracking-widest">
        At a glance
      </h2>
      <dl className="divide-y border-t">
        {facts.map(([label, value, note]) => (
          <div key={label} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <dt className="text-sm">{label}</dt>
              <dd className="text-muted-foreground text-xs">{note}</dd>
            </div>
            <span className="font-bold font-display text-lg tabular-nums">{value}</span>
          </div>
        ))}
      </dl>
    </section>
  );
}

const GOAL_DAY = 8 * 60;

/** The colour of a date's weekday (Monday first), the same seven as the Today week bars and the Month calendar. */
const weekdayColor = (date: string) => DAY_COLORS[(fromISODate(date).getDay() + 6) % 7];

/** The dates of the period, one per day, from `from`. */
function datesFrom(from: string, count: number): string[] {
  const start = fromISODate(from);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
}

/** Three cards, each with a small picture: a chart of the days (each in its weekday's colour), a gauge against an 8 hour day in the brand blend, a dot for every day in its weekday's colour. */
function GlanceStrip({
  facts,
  dayTotals,
  days,
  from,
  busiestDate,
  avg,
}: {
  facts: [string, string, string][];
  dayTotals: Record<string, number>;
  days: number;
  from?: string;
  busiestDate: string;
  avg: number;
}) {
  const dates = from ? datesFrom(from, days) : Object.keys(dayTotals).sort();
  const top = Math.max(1, ...dates.map((d) => dayTotals[d] ?? 0));
  const share = Math.min(1, avg / GOAL_DAY);
  const pictures = [
    <div key="chart" aria-hidden className="flex h-14 items-end gap-[3px]">
      {dates.map((d) => (
        <span
          key={d}
          className="min-w-0 flex-1 rounded-sm"
          style={{
            height: `${Math.max(dayTotals[d] ? 8 : 3, ((dayTotals[d] ?? 0) / top) * 100)}%`,
            // Every day in its weekday's colour; the busiest at full strength, the rest a little softer, empty days grey.
            backgroundColor: dayTotals[d] ? weekdayColor(d) : "color-mix(in oklab, var(--foreground) 20%, transparent)",
            opacity: dayTotals[d] ? (d === busiestDate ? 1 : 0.7) : 0.5,
          }}
        />
      ))}
    </div>,
    <div key="gauge" aria-hidden className="flex flex-col gap-1.5">
      <div className="relative h-3 overflow-hidden rounded-full bg-muted">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${share * 100}%`, ...blendSlice(0, Math.max(0.01, share)) }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] text-foreground/70">
        <span>0</span>
        <span>{Math.round(share * 100)}% of an 8 h day</span>
        <span>8 h</span>
      </div>
    </div>,
    <div key="dots" aria-hidden className="flex flex-wrap gap-1.5">
      {dates.map((d) => (
        <span
          key={d}
          className={`size-3 rounded-full ${dayTotals[d] ? "" : "bg-foreground/15"}`}
          style={dayTotals[d] ? { backgroundColor: weekdayColor(d) } : undefined}
        />
      ))}
    </div>,
  ];
  return (
    <section aria-label="At a glance" data-headerless="three facts in a row" className="grid gap-3 md:grid-cols-3">
      {facts.map(([label, value, note], i) => (
        <dl
          key={label}
          className="flex flex-col justify-between gap-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <dt className="font-mono text-[11px] text-foreground/75 uppercase tracking-widest">{label}</dt>
              <dd className="mt-1 text-muted-foreground text-xs">{note}</dd>
            </div>
            <span className="font-bold font-display text-4xl tabular-nums leading-none">{value}</span>
          </div>
          {pictures[i]}
        </dl>
      ))}
    </section>
  );
}
