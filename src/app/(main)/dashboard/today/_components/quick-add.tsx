"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronDown, Play } from "lucide-react";
import { toast } from "sonner";

import { NoteTextarea } from "@/components/note-textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
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
        <NoteTextarea
          value={note}
          onChange={setNote}
          onKeyDown={(e) => {
            // Enter saves when a time is typed, otherwise moves on to the time field.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (parsed !== null) void submit();
              else durationRef.current?.focus();
            }
          }}
          placeholder="What did you work on? (optional)"
          aria-label="Description"
          rows={2}
          className="min-h-20 resize-none py-2.5 text-base"
        />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor="quick-duration" className="font-medium text-sm">
            How long?
          </label>
          <Input
            id="quick-duration"
            ref={durationRef}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Type it, like 1.5, 1:30 or 90m"
            aria-invalid={invalid}
            inputMode="decimal"
            enterKeyHint="done"
            className="h-12 text-base"
          />
          <p className={`h-4 text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}>
            {invalid ? "Try 1.5, 1:30 or 90m" : parsed ? `= ${formatDuration(parsed)} h` : ""}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {DURATION_CHIPS.map((c) => (
              <Button
                key={c.minutes}
                type="button"
                variant={parsed === c.minutes ? "secondary" : "outline"}
                aria-pressed={parsed === c.minutes}
                className="h-11 text-base"
                onClick={() => {
                  setDuration(`${c.minutes}m`);
                  durationRef.current?.focus();
                }}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </div>
        <Button type="submit" size="lg" disabled={create.isPending || parsed === null} className="h-14 w-full text-lg">
          Save <Kbd className="ml-1 hidden bg-primary-foreground/20 text-primary-foreground md:inline-flex">↵</Kbd>
        </Button>
      </form>

      <div className="flex items-center justify-between gap-3 border-t pt-3 text-muted-foreground text-sm">
        <span>Haven't done it yet?</span>
        <Button type="button" variant="ghost" onClick={startTimer} disabled={start.isPending}>
          <Play className="size-4" /> {timerRunning ? "Switch the timer to this" : "Start a timer"}
        </Button>
      </div>
    </div>
  );
}
