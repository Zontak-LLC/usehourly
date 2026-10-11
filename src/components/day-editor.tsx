"use client";

import Link from "next/link";

import { EntryRow } from "@/app/(main)/dashboard/today/_components/entry-row";
import { QuickAdd } from "@/app/(main)/dashboard/today/_components/quick-add";
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
 * Edit one day without leaving the page you're on (Week, Month, …). It reuses the Today page's
 * rows and quick-add, so changing hours, notes or project, deleting, and adding an entry all
 * behave exactly as they do there — and every list that shows time refreshes behind it.
 */
export function DayEditorDialog({ date, onClose }: { date: string | null; onClose: () => void }) {
  const open = date !== null;
  const entries = trpc.entry.list.useQuery({ from: date ?? "", to: date ?? "" }, { enabled: open });
  const running = trpc.entry.running.useQuery(undefined, { enabled: open });
  const clients = trpc.clients.list.useQuery(undefined, { enabled: open });

  const total = (entries.data ?? []).reduce((a, e) => a + e.minutes, 0);
  const hasProjects = (clients.data ?? []).some((c) => c.projects.length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{date ? longDate.format(fromISODate(date)) : ""}</DialogTitle>
          <DialogDescription>
            {entries.data ? `${formatDuration(total)} logged` : "Loading…"} · change hours inline, or add an entry below
          </DialogDescription>
        </DialogHeader>

        {entries.error ? (
          <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
            Couldn't load this day: {entries.error.message}
          </p>
        ) : entries.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : entries.data && entries.data.length > 0 ? (
          <ul className="divide-y rounded-xl border bg-card">
            {entries.data.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed py-6 text-center text-muted-foreground text-sm">
            Nothing logged this day yet.
          </p>
        )}

        {date &&
          (hasProjects ? (
            <QuickAdd date={date} timerRunning={!!running.data} />
          ) : (
            !clients.isLoading && (
              <p className="text-muted-foreground text-sm">
                Add a client and project under{" "}
                <Link href="/dashboard/clients" className="underline">
                  Clients &amp; projects
                </Link>{" "}
                to log time.
              </p>
            )
          ))}

        {date && (
          <Link href={`/dashboard/today?date=${date}`} className="self-start text-muted-foreground text-xs underline">
            Open this day's full page
          </Link>
        )}
      </DialogContent>
    </Dialog>
  );
}
