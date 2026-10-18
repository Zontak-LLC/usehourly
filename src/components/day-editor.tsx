"use client";

import Link from "next/link";

import { QuickAdd } from "@/app/(main)/dashboard/today/_components/quick-add";
import { EntryList } from "@/components/entry-list";
import { MergeEntriesBar } from "@/components/merge-entries-bar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { trpc } from "@/lib/trpc";

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
export function DayEditorPanel({ date, projectFilter = "" }: { date: string; projectFilter?: string }) {
  const entries = trpc.entry.list.useQuery({ from: date, to: date });
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
      ) : rows.length > 0 ? (
        <>
          <EntryList entries={rows} showTotal={false} />
          <MergeEntriesBar entries={rows} />
        </>
      ) : (
        <p className="rounded-xl border border-dashed py-6 text-center text-muted-foreground text-sm">
          Nothing logged this day yet.
        </p>
      )}

      {hasProjects ? (
        <QuickAdd date={date} timerRunning={!!running.data} dayMinutes={total} />
      ) : (
        !clients.isLoading && (
          <p className="text-muted-foreground text-sm">
            Add a client and project under{" "}
            <Link href="/dashboard/clients" className="underline">
              Clients & Projects
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
          <DialogTitle>{date ? longDate.format(fromISODate(date)) : ""}</DialogTitle>
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
