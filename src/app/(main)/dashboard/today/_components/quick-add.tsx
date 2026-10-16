"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronDown, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { formatDuration, parseDuration } from "@/lib/duration";
import { DURATION_CHIPS } from "@/lib/quick-start";
import { trpc } from "@/lib/trpc";

const LAST_PROJECT_KEY = "hourly:lastProject";

function readLast(): string {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function QuickAdd({ date, timerRunning }: { date: string; timerRunning: boolean }) {
  const utils = trpc.useUtils();
  const clients = trpc.clients.list.useQuery();
  const create = trpc.entry.create.useMutation();
  const start = trpc.entry.start.useMutation();
  const remove = trpc.entry.delete.useMutation();

  const [projectId, setProjectId] = useState("");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const durationRef = useRef<HTMLInputElement>(null);

  const projects = clients.data?.flatMap((c) => c.projects) ?? [];
  // Restore the last-used project, falling back to the first available one.
  useEffect(() => {
    if (projectId || projects.length === 0) return;
    const last = readLast();
    setProjectId(projects.some((p) => p.id === last) ? last : projects[0].id);
  }, [projects, projectId]);

  // "n" focuses the duration field from anywhere (unless typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) {
        e.preventDefault();
        durationRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const parsed = parseDuration(duration);
  const invalid = duration.trim() !== "" && parsed === null;

  function remember(id: string) {
    setProjectId(id);
    try {
      localStorage.setItem(LAST_PROJECT_KEY, id);
    } catch {
      // Remembering the project is a convenience; ignore storage being unavailable.
    }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!projectId) return toast.error("Pick a project first.");
    if (parsed === null) return toast.error("Couldn't read that duration. Try 1.5, 1:30 or 90m.");
    try {
      await create.mutateAsync({ projectId, date, minutes: parsed, note });
      await utils.entry.list.invalidate();
      setDuration("");
      setNote("");
      durationRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that entry.");
    }
  }

  /** One tap logs that much time on the chosen project, with an Undo for fat-finger mistakes. */
  async function logChip(minutes: number, label: string) {
    if (!projectId) return toast.error("Pick a project first.");
    try {
      const entry = await create.mutateAsync({ projectId, date, minutes, note });
      await utils.entry.list.invalidate();
      setNote("");
      toast.success(`Added ${label}.`, {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await remove.mutateAsync({ id: entry.id });
              await utils.entry.list.invalidate();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Couldn't undo that.");
            }
          },
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that entry.");
    }
  }

  async function startTimer() {
    if (!projectId) return toast.error("Pick a project first.");
    try {
      await start.mutateAsync({ projectId, date, note });
      await Promise.all([utils.entry.running.invalidate(), utils.entry.list.invalidate()]);
      setNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the timer.");
    }
  }

  const onlyProject = projects.length === 1 ? projects[0] : null;
  const onlyClient = onlyProject ? clients.data?.find((c) => c.projects.some((p) => p.id === onlyProject.id)) : null;

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="quick-project" className="font-medium text-sm">
          What are you working on?
        </label>
        {onlyProject ? (
          <p className="text-base">
            {onlyClient?.name} · {onlyProject.name}
          </p>
        ) : (
          <div className="relative w-full">
            <select
              id="quick-project"
              value={projectId}
              onChange={(e) => remember(e.target.value)}
              className="h-12 w-full appearance-none rounded-lg border border-input bg-transparent pr-10 pl-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {clients.data?.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {c.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground" />
          </div>
        )}
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds the typed time, or starts the timer when no time is typed.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (parsed !== null) void submit();
              else void startTimer();
            }
          }}
          placeholder="Add a note (optional)"
          aria-label="Note"
          rows={1}
          className="min-h-11 resize-none py-2.5 text-base"
          maxLength={500}
        />
      </div>

      <Button type="button" size="lg" className="h-14 w-full text-lg" onClick={startTimer} disabled={start.isPending}>
        <Play className="size-5" /> {timerRunning ? "Switch the timer to this" : "Start timer"}
      </Button>

      <div className="flex items-center gap-3 text-muted-foreground text-sm">
        <span className="h-px flex-1 bg-border" />
        or add time you already worked
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-medium text-sm">How long?</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {DURATION_CHIPS.map((c) => (
            <Button
              key={c.minutes}
              type="button"
              variant="outline"
              className="h-11 text-base"
              disabled={create.isPending}
              onClick={() => logChip(c.minutes, c.label)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="w-full sm:flex-1">
          <Input
            ref={durationRef}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Or type it, like 1.5 or 90m"
            aria-label="Type a duration"
            aria-invalid={invalid}
            inputMode="decimal"
            enterKeyHint="done"
            className="h-11 text-base"
          />
          <p className={`mt-1 h-4 text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}>
            {invalid ? "Try 1.5, 1:30 or 90m" : parsed ? `= ${formatDuration(parsed)} h` : ""}
          </p>
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={create.isPending || parsed === null}
          className="h-11 w-full text-base sm:w-auto"
        >
          Add time <Kbd className="ml-1 hidden bg-primary-foreground/20 text-primary-foreground md:inline-flex">↵</Kbd>
        </Button>
      </form>
    </div>
  );
}
