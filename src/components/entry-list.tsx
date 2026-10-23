import { EntryRow } from "@/app/(main)/dashboard/today/_components/entry-row";
import { HeaderCard } from "@/components/header-card";
import { useRunningMinutes } from "@/components/use-running-minutes";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";

const longDay = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

type Entry = Parameters<typeof EntryRow>[0]["entry"];

/**
 * The entries of one day: the day's timesheet as ONE headed card. The header names the day ("Today's timesheet",
 * "Timesheet for Monday, October 12"), the number of entries and the total; each entry is a row inside it.
 */
export function EntryList({
  entries,
  date,
  today,
  showTotal = true,
}: {
  entries: Entry[];
  /** The day these entries belong to (YYYY-MM-DD). */
  date: string;
  /** Today's date, so today's list can say "Today's". */
  today?: string | null;
  showTotal?: boolean;
}) {
  const title = date === today ? "Today's timesheet" : `Timesheet for ${longDay.format(fromISODate(date))}`;
  // A running timer counts in the total as it runs, so this agrees with the watch and the header.
  const running = useRunningMinutes(entries.find((e) => e.started_at)?.started_at ?? null);
  const total = entries.reduce((a, e) => a + e.minutes, 0) + running;
  return (
    <HeaderCard
      label={title}
      header={
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold text-base">
            {title}{" "}
            <span className="font-normal text-foreground/75 text-sm">
              ({entries.length} {entries.length === 1 ? "entry" : "entries"})
            </span>
          </h2>
          {showTotal && (
            <span className="text-sm">
              <span className="text-foreground/75">Total </span>
              <span className="font-display font-extrabold text-xl tabular-nums">{formatDuration(total)}</span>
            </span>
          )}
        </div>
      }
    >
      <ul className="divide-y border-y">
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} bare />
        ))}
      </ul>
    </HeaderCard>
  );
}
