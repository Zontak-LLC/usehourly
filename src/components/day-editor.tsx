"use client";

import Link from "next/link";

import type { inferRouterOutputs } from "@trpc/server";

import { EntryRow } from "@/app/(main)/dashboard/today/_components/entry-row";
import { QuickAdd } from "@/app/(main)/dashboard/today/_components/quick-add";
import { EntryList } from "@/components/entry-list";
import { HeaderCard } from "@/components/header-card";
import { HoursChip } from "@/components/hours-chip";
import { MergeEntriesBar } from "@/components/merge-entries-bar";
import { NonBillableToggle } from "@/components/non-billable-toggle";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "@/server/routers/_app";

type DayEntries = inferRouterOutputs<AppRouter>["entry"]["list"];

const longDate = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

/**
 * The editor for one day: its entries (change hours, notes, project, delete), merge, and the add form. It reuses the
 * Today page's rows and quick-add, so everything behaves exactly as it does there. `projectFilter` shows only that
 * project's rows (the Week page's filter). Used inline on the Week page and inside the dialog on the Month page.
 */
export function DayEditorPanel({
  date,
  projectFilter = "",
  inPage = false,
  weekSeed,
}: {
  date: string;
  projectFilter?: string;
  /**
   * On the Week page (true) the day is one card: a header (what it is, the entry count, the total, the non-billable
   * button) with the entries as cards inside it, and no date anywhere (the day strip above already says which day).
   * In the Month dialog (false) the dialog's own title carries the date and the non-billable button.
   */
  inPage?: boolean;
  /**
   * What the Week page has already loaded for the whole week (its entries and marked days, and when they arrived): this
   * day is taken from it instead of being asked for again, which would be a second copy of the same rows.
   */
  weekSeed?: {
    entries: DayEntries;
    days: string[];
    updatedAt: number;
    daysUpdatedAt: number;
  };
}) {
  const entries = trpc.entry.list.useQuery(
    { from: date, to: date },
    weekSeed
      ? { initialData: weekSeed.entries.filter((e) => e.date === date), initialDataUpdatedAt: weekSeed.updatedAt }
      : undefined,
  );
  const running = trpc.entry.running.useQuery();
  const clients = trpc.clients.list.useQuery();

  const all = entries.data ?? [];
  const rows = projectFilter ? all.filter((e) => e.project_id === projectFilter) : all;
  const total = all.reduce((a, e) => a + e.minutes, 0);
  const hasProjects = (clients.data ?? []).some((c) => c.projects.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {entries.error ? (
        <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
          Couldn't load this day: {entries.error.message}
        </p>
      ) : entries.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : inPage ? (
        <HeaderCard
          light
          header={
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div>
                <h2 className="font-semibold text-base">This day's timesheet</h2>
                <p className="text-foreground/75 text-sm">
                  {rows.length === 0
                    ? "Nothing logged yet"
                    : `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {total > 0 && <HoursChip label="Total">{formatDuration(total)}</HoursChip>}
                <NonBillableToggle
                  date={date}
                  labelled
                  seed={weekSeed && { days: weekSeed.days, updatedAt: weekSeed.daysUpdatedAt }}
                />
              </div>
            </div>
          }
        >
          {rows.length > 0 && (
            <>
              <ul className="flex flex-col gap-2">
                {rows.map((e) => (
                  <EntryRow key={e.id} entry={e} bare />
                ))}
              </ul>
              <MergeEntriesBar entries={rows} />
            </>
          )}
        </HeaderCard>
      ) : rows.length > 0 ? (
        <>
          <EntryList entries={rows} date={date} showTotal={false} />
          <MergeEntriesBar entries={rows} />
        </>
      ) : null}

      {hasProjects ? (
        <QuickAdd date={date} timerRunning={!!running.data} dayMinutes={total} showDate={!inPage} />
      ) : (
        !clients.isLoading && (
          <p className="text-muted-foreground text-sm">
            Add a client and project under{" "}
            <Link href="/dashboard/clients" className="underline">
              Clients
            </Link>{" "}
            to log time.
          </p>
        )
      )}
    </div>
  );
}

/** Edit one day in a dialog, without leaving the page you're on (Month). */
export function DayEditorDialog({ date, onClose }: { date: string | null; onClose: () => void }) {
  const open = date !== null;
  const entries = trpc.entry.list.useQuery({ from: date ?? "", to: date ?? "" }, { enabled: open });
  const total = (entries.data ?? []).reduce((a, e) => a + e.minutes, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle>{date ? longDate.format(fromISODate(date)) : ""}</DialogTitle>
            {date && <NonBillableToggle date={date} />}
          </div>
          <DialogDescription>
            {entries.data ? `${formatDuration(total)} logged` : "Loading…"} · change hours inline, or add an entry below
          </DialogDescription>
        </DialogHeader>
        {date && <DayEditorPanel date={date} />}
        {date && (
          <Link href={`/dashboard/today?date=${date}`} className="self-start text-muted-foreground text-xs underline">
            Open this day's full page
          </Link>
        )}
      </DialogContent>
    </Dialog>
  );
}
