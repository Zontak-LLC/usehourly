"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronDown, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { formatDuration, parseDuration } from "@/lib/duration";
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-start">
      <div className="relative w-full sm:w-56">
        <select
          value={projectId}
          onChange={(e) => remember(e.target.value)}
          aria-label="Project"
          className="h-9 w-full appearance-none rounded-lg border border-input bg-transparent pr-8 pl-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
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
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      <div className="w-full sm:w-32">
        <Input
          ref={durationRef}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="1.5 · 1:30 · 90m"
          aria-label="Duration"
          aria-invalid={invalid}
          className="h-9"
          autoFocus
        />
        <p className={`mt-1 h-4 text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}>
          {invalid ? "Try 1.5, 1:30 or 90m" : parsed ? `= ${formatDuration(parsed)} h` : ""}
        </p>
      </div>

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          // Enter still logs the entry (fast path); Shift+Enter adds a line break.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder="What did you work on?"
        aria-label="Note"
        rows={1}
        className="min-h-9 flex-1 resize-none py-1.5"
        maxLength={500}
      />

      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending || parsed === null} className="h-9">
          Add <Kbd className="ml-1 bg-primary-foreground/20 text-primary-foreground">↵</Kbd>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-9"
          onClick={startTimer}
          disabled={start.isPending}
          title={timerRunning ? "Switches the running timer to this project" : "Start a timer"}
        >
          <Play /> {timerRunning ? "Switch" : "Start"}
        </Button>
      </div>
    </form>
  );
}
