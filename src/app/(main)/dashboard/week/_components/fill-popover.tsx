"use client";

import { useState } from "react";

import { Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { fromISODate } from "@/lib/dates";
import { parseDuration } from "@/lib/duration";
import type { Cell } from "@/lib/timesheet";
import { trpc } from "@/lib/trpc";

const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });

/** Fill one project across several days of the visible week in one go. */
export function FillPopover({
  projectId,
  label,
  days,
  cells,
  onDone,
}: {
  projectId: string;
  label: string;
  days: string[];
  cells: Record<string, Cell>;
  onDone: () => void;
}) {
  const bulk = trpc.entry.bulkSet.useMutation();
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState("8");
  const [note, setNote] = useState("");
  // Monday–Friday selected by default; weekends are opt-in.
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(days.filter((d) => ![0, 6].includes(fromISODate(d).getDay()))),
  );
  const [replace, setReplace] = useState(false);

  const minutes = parseDuration(duration);
  const targets = days.filter((d) => picked.has(d) && (replace || !cells[d]?.minutes));
  const toggle = (d: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });

  async function apply() {
    if (minutes === null || minutes < 1) return toast.error("Couldn't read that duration. Try 8, 7.5 or 6:30.");
    if (targets.length === 0) return toast.error("No days to fill. Pick days, or tick “Replace existing”.");
    try {
      const res = await bulk.mutateAsync({
        projectId,
        cells: targets.map((date) => ({ date, minutes })),
        note: note.trim() || undefined,
      });
      const done = res.created + res.updated;
      if (res.skipped.length) {
        toast.warning(
          `Filled ${done} day${done === 1 ? "" : "s"}. Skipped ${res.skipped.length} with several entries or a running timer.`,
        );
      } else {
        toast.success(`Filled ${done} day${done === 1 ? "" : "s"}.`);
      }
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't fill those days.");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Fill days for ${label}`} title="Fill several days">
          <Wand2 />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="start">
        <p className="font-medium text-sm">Fill days · {label}</p>
        <Input
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          aria-label="Hours per day"
          placeholder="8 · 7.5 · 6:30"
          autoFocus
        />
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did you work on? (same description on every day)"
          aria-label="Description of work"
          rows={2}
          maxLength={500}
          className="resize-none"
        />
        <div className="flex flex-wrap gap-1">
          {days.map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={picked.has(d) ? "default" : "outline"}
              onClick={() => toggle(d)}
              aria-pressed={picked.has(d)}
              className="h-7 px-2"
            >
              {weekday.format(fromISODate(d))}
            </Button>
          ))}
        </div>
        <div className="flex gap-3 text-xs">
          <button type="button" className="underline" onClick={() => setPicked(new Set(days.slice(0, 5)))}>
            Mon–Fri
          </button>
          <button type="button" className="underline" onClick={() => setPicked(new Set(days))}>
            All 7
          </button>
          <button type="button" className="underline" onClick={() => setPicked(new Set())}>
            None
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          Replace existing time{note.trim() ? " and description" : ""}
        </label>
        <Button onClick={apply} disabled={bulk.isPending || minutes === null} className="w-full">
          {bulk.isPending ? "Filling…" : `Fill ${targets.length} day${targets.length === 1 ? "" : "s"}`}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
