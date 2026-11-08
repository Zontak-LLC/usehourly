import { formatDate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import type { ShareSnapshot } from "@/lib/timesheet-share";

type Note = NonNullable<ShareSnapshot["notes"]>[number];

const GRID = "grid-cols-[6.5rem_minmax(0,13rem)_minmax(0,1fr)_4rem]";
const COLS = "sm:grid-cols-[6.5rem_minmax(0,13rem)_minmax(0,1fr)_4rem]";

/**
 * "What was worked on" as a table: Date, Project, the work, Hours. The date is written once per day (later rows of the
 * same day leave it blank), the client's name shows under the project only when the sheet has more than one client, and
 * on a phone each row is two lines (date, project and hours, then the work) with no empty columns.
 */
export function NotesTable({ notes }: { notes: Note[] }) {
  const several = new Set(notes.map((n) => n.client)).size > 1;
  return (
    <section aria-label="What was worked on" className="overflow-hidden rounded-xl border bg-card">
      <h2 className="border-b bg-band-2 px-4 py-3 font-semibold text-base">What was worked on</h2>
      <div
        aria-hidden
        className={`hidden ${GRID} gap-x-3 border-b px-4 py-2 text-muted-foreground text-xs sm:grid print:grid`}
      >
        <span>Date</span>
        <span>Project</span>
        <span>Work</span>
        <span className="text-right">Hours</span>
      </div>
      <ul className="divide-y">
        {notes.map((n, i) => {
          const firstOfDay = i === 0 || notes[i - 1].date !== n.date;
          return (
            <li
              key={`${n.date}|${n.client}|${n.project}|${n.note}`}
              className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm ${COLS} sm:items-baseline`}
            >
              <span
                className={`font-medium tabular-nums max-sm:col-span-2 max-sm:text-xs ${firstOfDay ? "" : "max-sm:hidden sm:invisible"}`}
              >
                {formatDate(n.date, "dayWithWeekday")}
              </span>
              <span className="min-w-0 text-foreground/80 max-sm:col-start-1 max-sm:row-start-2 max-sm:text-xs">
                <span className="font-medium text-foreground">{n.project}</span>
                {several && <span className="block text-muted-foreground text-xs sm:truncate">{n.client}</span>}
              </span>
              <span className="min-w-0 whitespace-pre-wrap break-words text-foreground/90 max-sm:col-span-2 max-sm:row-start-3">
                {n.note || <span className="text-muted-foreground">No description</span>}
              </span>
              <span className="text-right font-mono tabular-nums max-sm:col-start-2 max-sm:row-start-2">
                {formatDuration(n.minutes)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
