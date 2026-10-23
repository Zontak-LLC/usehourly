"use client";

import type { ReactNode } from "react";

import Link from "next/link";

import type { inferRouterOutputs } from "@trpc/server";
import { X } from "lucide-react";

import { EntryRow } from "@/app/(main)/dashboard/today/_components/entry-row";
import { QuickAdd } from "@/app/(main)/dashboard/today/_components/quick-add";
import { EntryList } from "@/components/entry-list";
import { HeaderCard } from "@/components/header-card";
import { HoursChip } from "@/components/hours-chip";
import { MergeEntriesBar } from "@/components/merge-entries-bar";
import { NonBillableToggle } from "@/components/non-billable-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { feature } from "@/lib/features";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "@/server/routers/_app";

type DayEntries = inferRouterOutputs<AppRouter>["entry"]["list"];

const longDate = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const dayTitle = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

/** "Tuesday, October 20, 2026": the title of a day card that has to say which day it is (Month). */
export const longDateLabel = (isoDate: string) => longDate.format(fromISODate(isoDate));

/**
 * The editor for one day: its entries (change hours, notes, project, delete), merge, and the add form. It reuses the
 * Today page's rows and quick-add, so everything behaves exactly as it does there. `projectFilter` shows only that
 * project's rows (the Week page's filter). Used inline on the Week page and inside the dialog on the Month page.
 */
export function DayEditorPanel({
  date,
  projectFilter = "",
  inPage = false,
  title,
  onClose,
  weekSeed,
  entryGrip,
}: {
  date: string;
  projectFilter?: string;
  /** Drawn before each entry row (Month: the handle that drags the entry onto another day). */
  entryGrip?: (entry: DayEntries[number]) => ReactNode;
  /** The card's title; by default the day's name ("Tuesday, October 20"). */
  title?: string;
  /** Shows a Close button in the card's header (Month: the card opens under the calendar and closes again). */
  onClose?: () => void;
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
        <DayCard
          date={date}
          rows={rows}
          total={total}
          weekSeed={weekSeed}
          hasProjects={hasProjects}
          projectsLoading={clients.isLoading}
          title={title}
          onClose={onClose}
          entryGrip={entryGrip}
        />
      ) : rows.length > 0 ? (
        <>
          <EntryList entries={rows} date={date} showTotal={false} />
          {feature("merge") && <MergeEntriesBar entries={rows} />}
        </>
      ) : null}

      {!inPage &&
        (hasProjects ? <QuickAdd date={date} dayMinutes={total} showDate /> : !clients.isLoading && <NoProjects />)}
    </div>
  );
}

/** The Week page's day: ONE card (header with the entry count, the total and the non-billable button; the entries; the add form). */
function DayCard({
  date,
  rows,
  total,
  weekSeed,
  hasProjects,
  projectsLoading,
  title,
  onClose,
  entryGrip,
}: {
  date: string;
  rows: DayEntries;
  total: number;
  weekSeed?: { entries: DayEntries; days: string[]; updatedAt: number; daysUpdatedAt: number };
  hasProjects: boolean;
  projectsLoading: boolean;
  title?: string;
  onClose?: () => void;
  entryGrip?: (entry: DayEntries[number]) => ReactNode;
}) {
  const shownTotal = rows.reduce((a, e) => a + e.minutes, 0);
  return (
    <HeaderCard
      header={
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div>
            {/* The day's own name, so the card still says which day it is once the day row has scrolled away. */}
            <h2 className="font-semibold text-base">{title ?? dayTitle.format(fromISODate(date))}</h2>
            <p className="text-foreground/75 text-sm">
              {rows.length === 0 ? "Nothing logged yet" : `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* The total of the rows shown, so a project filter never shows a total the list does not add up to. */}
            {shownTotal > 0 && <HoursChip label="Total">{formatDuration(shownTotal)}</HoursChip>}
            {feature("nonBillableDays") && (
              <NonBillableToggle
                date={date}
                labelled
                seed={weekSeed && { days: weekSeed.days, updatedAt: weekSeed.daysUpdatedAt }}
              />
            )}
            {onClose && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-10"
                onClick={onClose}
                aria-label="Close"
              >
                <X />
              </Button>
            )}
          </div>
        </div>
      }
    >
      {rows.length > 0 && (
        <>
          <ul className="divide-y border-y">
            {rows.map((e) =>
              entryGrip ? (
                // The row keeps its own list item; the handle sits beside it.
                <li key={e.id} className="flex items-stretch">
                  {entryGrip(e)}
                  <ul className="min-w-0 flex-1">
                    <EntryRow entry={e} bare />
                  </ul>
                </li>
              ) : (
                <EntryRow key={e.id} entry={e} bare />
              ),
            )}
          </ul>
          {feature("merge") && <MergeEntriesBar entries={rows} />}
        </>
      )}
      {/* The add form lives in the same card (one card for the day, not two). */}
      {hasProjects ? (
        <QuickAdd date={date} dayMinutes={total} showDate={false} bare />
      ) : (
        !projectsLoading && <NoProjects />
      )}
    </HeaderCard>
  );
}

function NoProjects() {
  return (
    <p className="text-muted-foreground text-sm">
      Add a client and project under{" "}
      <Link href="/dashboard/clients" className="underline">
        Clients
      </Link>{" "}
      to log time.
    </p>
  );
}
