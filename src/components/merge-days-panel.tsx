"use client";

import { useState } from "react";

import { Merge } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { findMergeGroups, type MergeInput, planMerge } from "@/lib/merge-entries";
import { trpc } from "@/lib/trpc";

type Entry = MergeInput & { project: { name: string } };

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

/**
 * Month/Week companion to the day editor's merge button: lists every day in view that has
 * several entries on one project and merges them one day at a time or all at once. A day that
 * can't be merged (running timer, over 24h, description too long) says why and is skipped.
 */
export function MergeDaysPanel({ entries }: { entries: Entry[] }) {
  const utils = trpc.useUtils();
  const merge = trpc.entry.merge.useMutation();
  const [busy, setBusy] = useState(false);

  const groups = findMergeGroups(entries).map((g) => ({ ...g, plan: planMerge(g.entries) }));
  if (groups.length === 0) return null;
  const ready = groups.filter((g) => !("error" in g.plan));

  async function run(list: typeof groups) {
    setBusy(true);
    let merged = 0;
    const failed: string[] = [];
    for (const g of list) {
      try {
        await merge.mutateAsync({ ids: g.entries.map((e) => e.id) });
        merged++;
      } catch (err) {
        failed.push(`${dayFmt.format(fromISODate(g.date))}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    await Promise.all([utils.entry.list.invalidate(), utils.entry.running.invalidate()]);
    setBusy(false);
    if (merged > 0) toast.success(`Merged ${merged} ${merged === 1 ? "day" : "days"} into one entry each.`);
    if (failed.length > 0) toast.error(`Couldn't merge: ${failed.join(" · ")}`);
  }

  return (
    <section className="rounded-xl border bg-card" aria-label="Days with several entries">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div>
          <h2 className="font-medium text-sm">Days with several entries</h2>
          <p className="text-muted-foreground text-xs">
            Same project, same day. Merging adds the hours and joins the descriptions.
          </p>
        </div>
        {ready.length > 1 && (
          <Button size="sm" onClick={() => run(ready)} disabled={busy}>
            <Merge className="size-4" /> {busy ? "Merging…" : `Merge all ${ready.length} days`}
          </Button>
        )}
      </div>
      <ul className="divide-y">
        {groups.map((g) => {
          const total = g.entries.reduce((a, e) => a + e.minutes, 0);
          const error = "error" in g.plan ? g.plan.error : null;
          return (
            <li
              key={`${g.date}|${g.projectId}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm"
            >
              <span className="w-24 shrink-0 text-muted-foreground text-xs">{dayFmt.format(fromISODate(g.date))}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{g.entries[0].project.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {g.entries.length} entries · {formatDuration(total)}
                </span>
                {error && <span className="block text-muted-foreground text-xs">Can't merge yet: {error}</span>}
              </span>
              <Button size="sm" variant="outline" disabled={busy || !!error} onClick={() => run([g])}>
                Merge
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
