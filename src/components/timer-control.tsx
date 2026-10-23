"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ChevronDown, Play, Square } from "lucide-react";
import { toast } from "sonner";

import { TimeTicket } from "@/components/time-ticket";
import { STOPPED_EVENT, type Stopped, TIMER_LOCK_MS, timerParts, useStopTimer } from "@/components/timer-panel";
import { playClick } from "@/lib/click-sound";
import { formatDuration } from "@/lib/duration";
import { NOTE_MAX } from "@/lib/notes";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** Sent when a timer starts, so the add form clears the description it used. */
export const TIMER_STARTED_EVENT = "hourly:timer-started";

/** The running timer's description is saved this long after the last key. */
const NOTE_SAVE_MS = 800;
/** "Started earlier?" shows for this long after a start (or until it is used). */
const EARLY_SECONDS = 120;
/** "Still working?" shows once a run reaches this many minutes. */
const LONG_RUN_MINUTES = 4 * 60;
/** The step of the - / + buttons after a stop, and the bounds they keep (the same as any entry: 1 minute to a day). */
export const NUDGE = 5;
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 24 * 60;
/** How far back the start can be moved (the server refuses more than 12 hours ago too). */
const MAX_SHIFT_MS = 12 * 60 * 60_000;
const EARLY_CHOICES = [
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
] as const;

export type TodayTimer = ReturnType<typeof useTodayTimer>;
type TimerProject = { id: string; name: string; clientName: string; color: string };

/** The timer's description while it runs: shown at once, saved a moment after the last key (and before a stop). */
function useRunningNote(entry: { id: string; note: string } | null) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<{ id: string; note: string } | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const pending = useRef<{ id: string; note: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setState("saving");
    try {
      // The plain client, so a save started just before leaving the page still goes out.
      await utils.client.entry.update.mutate({ id: p.id, note: p.note });
      utils.entry.running.setData(undefined, (old) => (old && old.id === p.id ? { ...old, note: p.note.trim() } : old));
      void utils.entry.list.invalidate();
      setState("saved");
    } catch (err) {
      setState("idle");
      toastError(err, "Couldn't save the description.");
    }
  }, [utils]);

  // Leaving the page sends what was typed (through a ref, so the save runs once, on the way out).
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(
    () => () => {
      void flushRef.current();
    },
    [],
  );

  function change(note: string) {
    if (!entry) return;
    setDraft({ id: entry.id, note });
    pending.current = { id: entry.id, note };
    setState("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), NOTE_SAVE_MS);
  }

  const value = draft && entry && draft.id === entry.id ? draft.note : (entry?.note ?? "");
  return { value, change, flush, state: entry ? state : ("idle" as const) };
}

/**
 * Today's one timer, a slim strip above the add form. Idle: Start (for the project on the chip). Running: Stop, a description
 * box and, for a moment, "Started earlier?". Stopped: "Saved h:mm" with - / + 5 min, then Undo / Resume / Done, which
 * stay until the person picks one (the time is already saved, so leaving the page keeps it). Every press locks the
 * buttons for a moment, so a double click cannot start and then stop (found 2026-10-23).
 */
export function useTodayTimer({
  projectId,
  projectName,
  date,
  note,
}: {
  projectId: string;
  projectName: string;
  date: string;
  note: string;
}) {
  const utils = trpc.useUtils();
  const clients = trpc.clients.list.useQuery();
  const running = trpc.entry.running.useQuery();
  const start = trpc.entry.start.useMutation();
  const discard = trpc.entry.delete.useMutation();
  const resume = trpc.entry.resume.useMutation();
  const shift = trpc.entry.shiftStart.useMutation();
  const { stopTimer, stopping } = useStopTimer();
  const [now, setNow] = useState(() => Date.now());
  const [stopped, setStopped] = useState<Stopped | null>(null);
  // A project picked on the watch itself; it only holds while the form keeps the project it had then.
  const [chosen, setChosen] = useState<{ formId: string; id: string } | null>(null);
  const [shiftedId, setShiftedId] = useState<string | null>(null);
  const lockedUntil = useRef(0);
  const nudges = useRef<Promise<unknown>>(Promise.resolve());
  const locked = () => Date.now() < lockedUntil.current;
  const lock = useCallback(() => {
    lockedUntil.current = Date.now() + TIMER_LOCK_MS;
  }, []);

  const entry = running.data?.started_at ? running.data : null;
  const runningNote = useRunningNote(entry);

  const projects: TimerProject[] = (clients.data ?? []).flatMap((c) =>
    c.projects.map((p) => ({ id: p.id, name: p.name, clientName: c.name, color: c.color })),
  );
  const timerProjectId = chosen && chosen.formId === projectId ? chosen.id : projectId;
  const timerProject = projects.find((p) => p.id === timerProjectId) ?? null;

  useEffect(() => {
    const onStopped = (e: Event) => {
      lock();
      setStopped((e as CustomEvent<Stopped>).detail);
    };
    window.addEventListener(STOPPED_EVENT, onStopped);
    return () => window.removeEventListener(STOPPED_EVENT, onStopped);
  }, [lock]);
  useEffect(() => {
    if (entry) setStopped(null);
  }, [entry]);
  useEffect(() => {
    if (!entry) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [entry]);

  const startedAt = entry?.started_at ? new Date(entry.started_at).getTime() : 0;
  // This run alone (a resumed entry also holds the minutes it had before).
  const runSeconds = entry ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const seconds = (entry?.minutes ?? 0) * 60 + runSeconds;
  const text = timerParts(seconds).text;

  useEffect(() => {
    if (!entry) return;
    const prev = document.title;
    document.title = `⏱ ${text} · ${entry.project.name} · UseHourly`;
    return () => {
      document.title = prev;
    };
  }, [entry, text]);

  const refresh = () =>
    Promise.all([utils.entry.running.invalidate(), utils.entry.list.invalidate(), utils.project.budgets.invalidate()]);

  async function onStart() {
    if (locked() || start.isPending) return;
    if (!timerProjectId) return toast.error("Pick a project first.");
    lock();
    playClick("start");
    try {
      await start.mutateAsync({ projectId: timerProjectId, date, note });
      setChosen(null);
      await refresh();
      window.dispatchEvent(new Event(TIMER_STARTED_EVENT));
    } catch (err) {
      toastError(err, "Couldn't start the timer.");
    }
  }

  async function onStop(minutesAgo?: number) {
    if (locked()) return;
    lock();
    playClick("stop");
    await runningNote.flush();
    await stopTimer(minutesAgo);
  }

  async function onDiscard() {
    if (!stopped || locked()) return;
    await nudges.current;
    try {
      await discard.mutateAsync({ id: stopped.id });
      await Promise.all([utils.entry.list.invalidate(), utils.project.budgets.invalidate()]);
      setStopped(null);
      toast.success("Undone. Nothing was saved.");
    } catch (err) {
      toastError(err, "Couldn't undo that time.");
    }
  }

  async function onResume() {
    if (!stopped || locked() || resume.isPending) return;
    lock();
    playClick("start");
    await nudges.current;
    try {
      await resume.mutateAsync({ id: stopped.id });
      await refresh();
    } catch (err) {
      toastError(err, "Couldn't resume the timer.");
    }
  }

  /** Done: the stopped time is already saved, so this only closes the strip; false while the buttons are still locked. */
  function onKeep(): boolean {
    if (locked()) return false;
    playClick("save");
    setStopped(null);
    return true;
  }

  /** - / + 5 min after a stop: shown at once, saved in order (one change after the other). */
  function onNudge(delta: number) {
    if (!stopped) return;
    const before = stopped.minutes;
    const next = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, before + delta));
    if (next === before) return;
    const id = stopped.id;
    setStopped({ ...stopped, minutes: next });
    nudges.current = nudges.current
      .then(() => utils.client.entry.update.mutate({ id, minutes: next }))
      .then(() => Promise.all([utils.entry.list.invalidate(), utils.project.budgets.invalidate()]))
      .catch((err) => {
        setStopped((s) => (s && s.id === id ? { ...s, minutes: before } : s));
        toastError(err, "Couldn't change the time.");
      });
  }

  async function onShift(minutes: number) {
    if (!entry || shift.isPending) return;
    try {
      await shift.mutateAsync({ minutes, tzOffset: new Date().getTimezoneOffset() });
      setShiftedId(entry.id);
      await refresh();
    } catch (err) {
      toastError(err, "Couldn't move the start.");
    }
  }

  // "Started earlier?": the choices that keep the start on the same day and within 12 hours.
  const earlyChoices =
    entry && runSeconds < EARLY_SECONDS && shiftedId !== entry.id
      ? EARLY_CHOICES.filter((c) => {
          const next = startedAt - c.minutes * 60_000;
          return now - next <= MAX_SHIFT_MS && new Date(next).toDateString() === new Date(startedAt).toDateString();
        })
      : [];

  return {
    entry,
    stopped,
    seconds,
    runMinutes: Math.floor(runSeconds / 60),
    text,
    projectName: timerProject?.name ?? projectName,
    projects,
    timerProject,
    chooseProject: (id: string) => setChosen({ formId: projectId, id }),
    note: runningNote,
    earlyChoices,
    onStart,
    onStop,
    onDiscard,
    onKeep,
    onResume,
    onNudge,
    onShift,
    shifting: shift.isPending,
    resuming: resume.isPending,
    busy: start.isPending || stopping || resume.isPending,
    discarding: discard.isPending,
  };
}

/** A small rounded button (the time choices). */
const PILL =
  "inline-flex h-9 min-w-0 items-center justify-center rounded-full bg-card px-3 text-xs ring-1 ring-foreground/15 transition-colors hover:bg-muted disabled:opacity-40";
const SMALL_TEXT = "text-muted-foreground text-xs";
const BUTTON =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 font-semibold text-sm transition-colors disabled:opacity-50";

/**
 * Which project the timer starts on (or runs on), with the client's colour. Idle, with two projects or more, it is a
 * plain select of the account's projects; picking one there does not change the Log time form.
 */
function ProjectChip({ timer }: { timer: TodayTimer }) {
  const running = timer.entry;
  const shown = running
    ? { name: running.project.name, clientName: running.project.client.name, color: running.project.client.color }
    : timer.timerProject;
  if (!shown) return null;
  const face = (
    <>
      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: shown.color }} />
      <span className="min-w-0 truncate">
        {shown.name}
        <span className="text-muted-foreground max-sm:hidden"> · {shown.clientName}</span>
      </span>
    </>
  );
  const chip = "relative inline-flex min-h-9 min-w-0 max-w-full items-center gap-2 text-sm";
  if (running || timer.projects.length < 2) {
    return (
      <p className={chip}>
        <span className="sr-only">Timer project: </span>
        {face}
      </p>
    );
  }
  return (
    <label className={`${chip} cursor-pointer rounded-full px-2 hover:bg-muted`}>
      {face}
      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <select
        aria-label="Timer project"
        value={timer.timerProject?.id ?? ""}
        onChange={(e) => timer.chooseProject(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {timer.projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.clientName}
          </option>
        ))}
      </select>
    </label>
  );
}

/** While the timer runs: one line for what the work is, saved as you type. */
function NoteField({ timer }: { timer: TodayTimer }) {
  return (
    <div className="flex w-full flex-col gap-1">
      <input
        type="text"
        aria-label="What are you working on?"
        placeholder="What are you working on?"
        maxLength={NOTE_MAX}
        value={timer.note.value}
        onChange={(e) => timer.note.change(e.target.value)}
        onBlur={() => void timer.note.flush()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void timer.note.flush();
          }
        }}
        enterKeyHint="done"
        className="h-10 w-full rounded-xl bg-background px-3 text-base ring-1 ring-foreground/15 placeholder:text-muted-foreground focus:outline-none focus:ring-foreground/40 sm:text-sm"
      />
      <span role="status" className={`min-h-4 text-right ${SMALL_TEXT}`}>
        {timer.note.state === "saving" ? "Saving…" : timer.note.state === "saved" ? "Saved" : ""}
      </span>
    </div>
  );
}

/** Right after a start: move the start back if the work began a little earlier. */
function StartedEarlier({ timer }: { timer: TodayTimer }) {
  if (timer.earlyChoices.length === 0) return null;
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0">
      <legend className={`float-left mr-1 ${SMALL_TEXT}`}>Started earlier? Move the start back:</legend>
      {timer.earlyChoices.map((c) => (
        <button
          key={c.minutes}
          type="button"
          aria-label={`Started ${c.label} earlier`}
          className={PILL}
          disabled={timer.shifting}
          onClick={() => void timer.onShift(c.minutes)}
        >
          {c.label}
        </button>
      ))}
    </fieldset>
  );
}

/** Minutes between a typed "HH:MM" today and now (null when the time is not before now). */
function minutesSince(time: string, now: number): number | null {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  const ago = Math.floor((now - at.getTime()) / 60_000);
  return ago >= 1 ? ago : null;
}

/** After 4 hours: a calm question, and a way to stop the timer at the moment the work really ended. */
function StillWorking({ timer }: { timer: TodayTimer }) {
  const [time, setTime] = useState("");
  if (!timer.entry || timer.runMinutes < LONG_RUN_MINUTES) return null;
  const run = timer.runMinutes;
  function stopAtTime() {
    const ago = minutesSince(time, Date.now());
    if (ago === null) return toast.error("Pick a time before now.");
    if (ago >= run) return toast.error("The timer had not started then. Pick a later time.");
    void timer.onStop(ago);
  }
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 rounded-xl border-0 bg-muted/60 p-3">
      <legend className="sr-only">Still working?</legend>
      <p className="text-sm">
        Running for {formatDuration(run)}. Still working?{" "}
        <span className="text-muted-foreground">If not, stop it when you stopped:</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {EARLY_CHOICES.map((c) => (
          <button
            key={c.minutes}
            type="button"
            aria-label={`Stop ${c.label} ago`}
            className={PILL}
            disabled={timer.busy}
            onClick={() => void timer.onStop(c.minutes)}
          >
            {c.label} ago
          </button>
        ))}
        <input
          type="time"
          aria-label="Stopped at"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="h-9 min-w-0 rounded-full bg-background px-3 text-base ring-1 ring-foreground/15 focus:outline-none focus:ring-foreground/40 sm:text-sm"
        />
        <button type="button" className={PILL} disabled={!time || timer.busy} onClick={stopAtTime}>
          Stop at this time
        </button>
      </div>
    </fieldset>
  );
}

/**
 * Today's timer as one slim strip above the add form (2026-10-23: it replaced the big watch; most people log after the
 * fact, so the timer is there for those who want it without taking a column of the page). One thing at a time:
 * idle = Start timer and the project it starts on; running = a red dot, the elapsed h:mm:ss, the project and Stop timer,
 * then a description box, "Started earlier?" for a moment and "Still working?" after 4 hours; stopped = "Saved 0:42"
 * (the entry it already is, - / + 5 min, Undo · Resume timer · Done), which stays until one is picked (issue 218).
 */
export function TimerControls({
  timer,
  online,
  bare = false,
}: {
  timer: TodayTimer;
  online: boolean;
  /** Inside another card (Today's day card footer): no frame of its own. */
  bare?: boolean;
}) {
  return (
    <section
      aria-label="Timer"
      className={
        bare
          ? "flex min-w-0 flex-1 basis-72 flex-col gap-3"
          : "flex flex-col gap-3 rounded-2xl bg-card px-4 py-3 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10"
      }
    >
      {timer.stopped ? (
        <TimeTicket timer={timer} />
      ) : timer.entry ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-full bg-[rgb(255_69_58)] motion-safe:animate-[blink_1.6s_ease-in-out_infinite]"
            />
            <span
              role="timer"
              aria-live="off"
              aria-label={`Timer ${timer.text}`}
              className="font-mono font-semibold text-2xl tabular-nums"
            >
              {timer.text}
            </span>
            <div className="min-w-0 flex-1 basis-40">
              <ProjectChip timer={timer} />
            </div>
            <button
              type="button"
              title={`Stop the timer on ${timer.entry.project.name}`}
              onClick={() => void timer.onStop()}
              disabled={timer.busy}
              className={`${BUTTON} bg-foreground text-background hover:opacity-90`}
            >
              <Square className="size-3.5" fill="currentColor" aria-hidden />
              Stop timer
            </button>
          </div>
          <NoteField timer={timer} />
          <StartedEarlier timer={timer} />
          <StillWorking timer={timer} />
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            title={
              online
                ? `Start timer${timer.projectName ? ` for ${timer.projectName}` : ""}`
                : "A timer needs a connection"
            }
            onClick={timer.onStart}
            disabled={timer.busy || !online}
            // Secondary to Log time: a quiet ghost button, not an outlined one that looks like the main action.
            className={`${BUTTON} text-foreground/80 hover:bg-muted hover:text-foreground`}
          >
            <Play className="size-3.5" fill="currentColor" aria-hidden />
            Start timer
          </button>
          <div className="min-w-0 flex-1 basis-40">
            <ProjectChip timer={timer} />
          </div>
        </div>
      )}
    </section>
  );
}
