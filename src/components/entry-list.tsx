import { EntryRow } from "@/app/(main)/dashboard/today/_components/entry-row";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";

const longDay = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

type Entry = Parameters<typeof EntryRow>[0]["entry"];

/**
 * The entries of one day: the day's timesheet. Each entry is its own card (project and controls in the header), under a
 * heading that names the day ("Today's timesheet", "Timesheet for Monday, October 12"), the number of entries and the total.
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
  const total = entries.reduce((a, e) => a + e.minutes, 0);
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="font-semibold text-sm">
          {title}{" "}
          <span className="font-normal text-muted-foreground">
            ({entries.length} {entries.length === 1 ? "entry" : "entries"})
          </span>
        </h2>
        {showTotal && (
          <span className="text-sm">
            <span className="text-foreground/75">Total </span>
            <span className="font-medium font-mono tabular-nums">{formatDuration(total)}</span>
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} />
        ))}
      </ul>
    </section>
  );
}
