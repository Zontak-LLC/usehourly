import { EntryRow } from "@/app/(main)/dashboard/today/_components/entry-row";
import { formatDuration } from "@/lib/duration";

type Entry = Parameters<typeof EntryRow>[0]["entry"];

/** The entries of one day, each its own card (project and controls in the header), under a small count and total. */
export function EntryList({
  entries,
  title = "Entries",
  showTotal = true,
}: {
  entries: Entry[];
  title?: string;
  showTotal?: boolean;
}) {
  const total = entries.reduce((a, e) => a + e.minutes, 0);
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="font-semibold text-sm">
          {title} <span className="font-normal text-muted-foreground">({entries.length})</span>
        </h2>
        {showTotal && <span className="font-medium font-mono text-sm tabular-nums">{formatDuration(total)}</span>}
      </div>
      <ul className="flex flex-col gap-2">
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} />
        ))}
      </ul>
    </section>
  );
}
