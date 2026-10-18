"use client";

import { useState } from "react";

import { Merge } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/duration";
import { type MergeInput, planMerge } from "@/lib/merge-entries";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

type Entry = MergeInput & { project: { name: string } };

/**
 * For each project with two or more entries on the same day, offers to fold them into one:
 * hours added, descriptions joined. Asks once, showing the result, before changing anything.
 */
export function MergeEntriesBar({ entries }: { entries: Entry[] }) {
  const utils = trpc.useUtils();
  const merge = trpc.entry.merge.useMutation();
  const [confirming, setConfirming] = useState<string | null>(null);

  const groups = new Map<string, Entry[]>();
  for (const e of entries) groups.set(e.project_id, [...(groups.get(e.project_id) ?? []), e]);
  const mergeable = [...groups.values()].filter((g) => g.length >= 2);
  if (mergeable.length === 0) return null;

  async function run(group: Entry[]) {
    try {
      const r = await merge.mutateAsync({ ids: group.map((e) => e.id) });
      await Promise.all([utils.entry.list.invalidate(), utils.entry.running.invalidate()]);
      toast.success(`Merged ${r.merged} entries into one (${formatDuration(r.minutes)}).`);
    } catch (err) {
      toastError(err, "Couldn't merge those entries.");
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="space-y-2">
      {mergeable.map((group) => {
        const key = group[0].project_id;
        const plan = planMerge(group);
        const total = group.reduce((a, e) => a + e.minutes, 0);
        const name = group[0].project.name;
        return confirming === key ? (
          <div key={key} className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              {"error" in plan
                ? plan.error
                : `Combine ${group.length} ${name} entries into one of ${formatDuration(total)}? Descriptions are joined, one per line.`}
            </span>
            {!("error" in plan) && (
              <Button size="sm" onClick={() => run(group)} disabled={merge.isPending}>
                {merge.isPending ? "Merging…" : "Merge"}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
              {"error" in plan ? "OK" : "Cancel"}
            </Button>
          </div>
        ) : (
          <Button key={key} variant="outline" size="sm" onClick={() => setConfirming(key)}>
            <Merge className="size-4" /> Merge {group.length} {name} entries into one
          </Button>
        );
      })}
    </div>
  );
}
