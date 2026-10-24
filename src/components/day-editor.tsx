"use client";

import { type ReactNode, useState } from "react";

import Link from "next/link";

import type { inferRouterOutputs } from "@trpc/server";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

import { EntryRow } from "@/app/(main)/dashboard/today/_components/entry-row";
import { QuickAdd } from "@/app/(main)/dashboard/today/_components/quick-add";
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

const dayTitle = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** What the page has already loaded for its whole period (Week's or Month's entries and marked days, and when). */
type PeriodSeed = { entries: DayEntries; days: string[]; daysUpdatedAt: number };

/** The seed from the page's two queries (its entries and its marked days), once both are in. */
export function periodSeed(
  entries: { data?: DayEntries },
  days: { data?: string[]; dataUpdatedAt: number },
): PeriodSeed | undefined {
  if (!entries.data || !days.data) return undefined;
  return {
    entries: entries.data,
    days: days.data,
    daysUpdatedAt: days.dataUpdatedAt,
  };
}

/**
 * The editor for one day, as ONE card: a header (the day's name, the entry count, the total, the non-billable button),
 * its entries (change hours, notes, project, delete) and the add form. It reuses the Today page's rows and quick-add, so
 * everything behaves exactly as it does there. `projectFilter` shows only that project's rows. Used on Week and Month.
 */
export function DayEditorPanel({
  date,
  projectFilter = "",
  seed,
  entryGrip,
  onStep,
  addBehindButton = false,
}: {
  date: string;
  projectFilter?: string;
  /**
   * What the page has already loaded for the period: this day is taken from it instead of being asked for again, which
   * would be a second copy of the same rows (and a second request on load).
   */
  seed?: PeriodSeed;
  /** Drawn before each entry row (Month: the handle that drags the entry onto another day). */
  entryGrip?: (entry: DayEntries[number]) => ReactNode;
  /** Month: ‹ › beside the day's name step to the day before or after. */
  onStep?: (delta: -1 | 1) => void;
  /** Month: the add form waits behind one "Log time on Oct 16" button (the day's entries come first). */
  addBehindButton?: boolean;
}) {
  // With a seed the day is read straight from the page's own period list (kept up to date by the same optimistic
  // changes and refreshes), so it never asks again: a copy restored from the device would otherwise be refetched.
  const own = trpc.entry.list.useQuery({ from: date, to: date }, { enabled: !seed });
  const entries = seed ? { data: seed.entries.filter((e) => e.date === date), error: null, isLoading: false } : own;
  const clients = trpc.clients.list.useQuery();

  const all = entries.data ?? [];
  const rows = projectFilter ? all.filter((e) => e.project_id === projectFilter) : all;
  const total = all.reduce((a, e) => a + e.minutes, 0);
  const hasProjects = (clients.data ?? []).some((c) => c.projects.length > 0);

  if (entries.error) {
    return (
      <p className="rounded-lg border border-destructive/40 p-3 text-destructive text-sm">
        Couldn't load entries: {entries.error.message}
      </p>
    );
  }
  if (entries.isLoading) return <Skeleton className="h-24 w-full" />;
  return (
    <HeaderCard
      header={
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-1">
            {onStep && <StepButton next={false} onClick={() => onStep(-1)} />}
            <div className="min-w-0">
              {/* The day's own name, so the card still says which day it is once the day row has scrolled away. */}
              <h2 className="font-semibold text-base">{dayTitle.format(fromISODate(date))}</h2>
              <p className="text-foreground/75 text-sm">
                {rows.length === 0 ? "No entries yet" : `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
              </p>
            </div>
            {onStep && <StepButton next onClick={() => onStep(1)} />}
          </div>
          <DayHeaderEnd date={date} rows={rows} seed={seed} />
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
        addBehindButton ? (
          <AddBehindButton date={date} total={total} />
        ) : (
          <QuickAdd date={date} dayMinutes={total} showDate={false} bare />
        )
      ) : (
        !clients.isLoading && <NoProjects />
      )}
    </HeaderCard>
  );
}

function StepButton({ next, onClick }: { next: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-11 shrink-0"
      onClick={onClick}
      aria-label={next ? "Next day" : "Previous day"}
    >
      {next ? <ChevronRight /> : <ChevronLeft />}
    </Button>
  );
}

/** The header's right end: the total of the rows shown and the non-billable button. */
function DayHeaderEnd({ date, rows, seed }: { date: string; rows: DayEntries; seed?: PeriodSeed }) {
  // The total of the rows shown, so a project filter never shows a total the list does not add up to.
  const shownTotal = rows.reduce((a, e) => a + e.minutes, 0);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {shownTotal > 0 && <HoursChip label="Total">{formatDuration(shownTotal)}</HoursChip>}
      {feature("nonBillableDays") && (
        <NonBillableToggle date={date} labelled seed={seed && { days: seed.days, updatedAt: seed.daysUpdatedAt }} />
      )}
    </div>
  );
}

/**
 * Month: the Log time form opens in place from one quiet button (the page's one solid button stays the form's own
 * Log time). The same button closes it again.
 */
function AddBehindButton({ date, total }: { date: string; total: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 self-start"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X /> : <Plus />}
        {open ? "Hide the form" : `Log time on ${shortDate.format(fromISODate(date))}`}
      </Button>
      {open && <QuickAdd date={date} dayMinutes={total} showDate={false} bare />}
    </>
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
