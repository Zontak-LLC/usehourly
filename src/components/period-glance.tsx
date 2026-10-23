import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { count } from "@/lib/plural";

const day = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

/**
 * A small card of three plain facts about the period on screen: the busiest day, the average on the days worked, and how
 * many days had time. It sits under "By project" so the left column is as full as the right. It shows nothing when no day
 * has time.
 */
export function PeriodGlance({ dayTotals, days }: { dayTotals: Record<string, number>; days: number }) {
  const worked = Object.entries(dayTotals).filter(([, minutes]) => minutes > 0);
  if (worked.length === 0) return null;
  const [busiestDate, busiest] = worked.reduce((a, b) => (b[1] > a[1] ? b : a));
  const total = worked.reduce((sum, [, minutes]) => sum + minutes, 0);
  const facts: [string, string, string][] = [
    ["Busiest day", formatDuration(busiest), day.format(fromISODate(busiestDate))],
    ["Average on a worked day", formatDuration(Math.round(total / worked.length)), count(worked.length, "day")],
    ["Days with time", `${worked.length}`, `of ${days}`],
  ];
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
