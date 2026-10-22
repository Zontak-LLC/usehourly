"use client";

import { useEffect, useRef, useState } from "react";

import { Play, Plus } from "lucide-react";
import { toast } from "sonner";

import { BudgetBar } from "@/components/budget-bar";
import { ClientCurrency } from "@/components/currency-provider";
import { NoteTextarea } from "@/components/note-textarea";
import { useCurrentUserId } from "@/components/offline-guard";
import { ProjectPicker } from "@/components/project-picker";
import { TimeRuler } from "@/components/time-ruler";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { useOptimisticEntries } from "@/components/use-optimistic-entries";
import { fromISODate, monthBounds } from "@/lib/dates";
import { formatDuration, parseDuration } from "@/lib/duration";
import { getActiveEngine } from "@/lib/local-sync/active";
import { addPending, isNetworkError } from "@/lib/offline-queue";
import { pendingEntry } from "@/lib/optimistic-entries";
import { DURATION_CHIPS } from "@/lib/quick-start";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";
import { notifyPending, useOnline } from "@/lib/use-offline";
import { useToday } from "@/lib/use-today";

/** What a time chip writes in the box: "30m", "1h", "1h30", "2h" (never "120m"). parseDuration reads all of them. */
function chipText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

const LAST_PROJECT_KEY = "hourly:lastProject";
function readLast(): string {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function QuickAdd({
  date,
  timerRunning,
  dayMinutes,
  showDate = true,
  bare = false,
  wide = false,
}: {
  date: string;
  timerRunning: boolean;
  dayMinutes: number;
  /** The Today page already shows the date in its header, so it turns this off; the day dialog keeps it. */
  showDate?: boolean;
  /** Without its own card and header: the Week page puts the form inside the day's card. */
  bare?: boolean;
  /** From a wide screen up the form is two columns (project and description at the left, time and the buttons at the right) for a page that gives it the full width. */
  wide?: boolean;
}) {
  const utils = trpc.useUtils();
  const clients = trpc.clients.list.useQuery();
  const userId = useCurrentUserId();
  const online = useOnline();
  const create = trpc.entry.create.useMutation();
  const optimistic = useOptimisticEntries();
  const start = trpc.entry.start.useMutation();

  const [projectId, setProjectId] = useState("");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  // Tapping the same chip again adds its time again (2 hours, again = 4 hours); typing or another chip starts over.
  const [chipRun, setChipRun] = useState<{ minutes: number; taps: number } | null>(null);
  const durationRef = useRef<HTMLInputElement>(null);
  // "Today" is the browser's date (the server runs in UTC), so it is worked out after the page loads.
  const isToday = useToday() === date;

  const projects = clients.data?.flatMap((c) => c.projects) ?? [];
  // The month of the day being logged: the budget for the project picked below, if it has one.
  const budgets = trpc.project.budgets.useQuery(monthBounds(date));
  const budget = budgets.data?.[projectId];
  // Restore the last-used project, falling back to the first available one.
  useEffect(() => {
    if (projectId || projects.length === 0) return;
    const last = readLast();
    setProjectId(projects.some((p) => p.id === last) ? last : projects[0].id);
  }, [projects, projectId]);

  // Land in the time field on a computer (on a phone that would pop the keyboard before you asked).
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) durationRef.current?.focus({ preventScroll: true }); // never scroll the page to the form on load
  }, []);

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
    // One id for this entry, kept if the send has to be retried, so the server saves it once however many times it arrives.
    const clientId = crypto.randomUUID();
    const finish = () => {
      setDuration("");
      setNote("");
      durationRef.current?.focus();
    };
    // With the copy on this device switched on, the device itself takes the entry and sends it later (issue #95).
    if (!online && !getActiveEngine()?.ready) return saveOnDevice(clientId, parsed, finish);
    // Show the entry in the list and clear the form NOW; the server's answer only confirms it (or takes it back).
    const owner = clients.data?.find((c) => c.projects.some((p) => p.id === projectId));
    const row =
      owner && userId
        ? pendingEntry({ clientId, userId, client: owner, projectId, date, minutes: parsed, note, nonBillable: false })
        : null;
    const undo = row ? await optimistic.add(row) : null;
    const typed = { duration, note };
    if (row) finish();
    try {
      await create.mutateAsync({ projectId, date, minutes: parsed, note, clientId });
      await Promise.all([utils.entry.list.invalidate(), utils.project.budgets.invalidate()]);
      if (!row) finish();
    } catch (err) {
      undo?.();
      // No connection (or the server is unreachable): keep the entry on this device and send it later.
      if (isNetworkError(err)) return saveOnDevice(clientId, parsed, finish);
      if (row) {
        setDuration(typed.duration); // give back what was typed so nothing is lost
        setNote(typed.note);
      }
      toastError(err, "Couldn't save that entry.");
    }
  }

  /** Keeps an entry typed without a connection on this device; OfflineSync sends it when the connection is back. */
  function saveOnDevice(clientId: string, minutes: number, finish: () => void) {
    if (!userId) return toast.error("Couldn't save that without a connection. Please try again when you're online.");
    const kept = addPending(localStorage, { clientId, userId, projectId, date, minutes, note, createdAt: Date.now() });
    if (!kept) return toast.error("Couldn't save that on this device. Please try again when you're online.");
    notifyPending();
    toast.info("No connection: saved on this device. It will be sent when you're back online.");
    finish();
  }

  async function startTimer() {
    if (!projectId) return toast.error("Pick a project first.");
    try {
      await start.mutateAsync({ projectId, date, note });
      await Promise.all([
        utils.entry.running.invalidate(),
        utils.entry.list.invalidate(),
        utils.project.budgets.invalidate(),
      ]);
      setNote("");
    } catch (err) {
      toastError(err, "Couldn't start the timer.");
    }
  }

  const polishOwner = clients.data?.find((c) => c.projects.some((p) => p.id === projectId));
  const polishContext = {
    project: polishOwner?.projects.find((p) => p.id === projectId)?.name ?? "",
    client: polishOwner?.name ?? "",
  };

  const dayLabel = fromISODate(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const onlyProject = projects.length === 1 ? projects[0] : null;
  const onlyClient = onlyProject ? clients.data?.find((c) => c.projects.some((p) => p.id === onlyProject.id)) : null;

  const wc = (classes: string) => (wide ? classes : "");
  const body = (
    <div className={bare ? "flex flex-col gap-3" : "flex flex-col gap-3 p-3 sm:p-4"}>
      <form
        method="post"
        onSubmit={submit}
        className={`flex flex-col gap-2.5 ${wc("lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-3")}`}
      >
        {onlyProject ? (
          <p className={`text-base ${wc("lg:col-start-1 lg:row-start-1")}`}>
            {onlyClient?.name} · {onlyProject.name}
          </p>
        ) : (
          <div className={`flex flex-col gap-2 ${wc("lg:col-start-1 lg:row-start-1")}`}>
            <p id="quick-project-label" className="font-medium text-sm">
              Pick your project
            </p>
            <ProjectPicker
              projects={(clients.data ?? []).flatMap((c) =>
                c.projects.map((p) => ({ id: p.id, name: p.name, clientName: c.name, color: c.color })),
              )}
              value={projectId}
              onChange={remember}
              onPicked={() => durationRef.current?.focus({ preventScroll: true })}
            />
          </div>
        )}

        <div className={`flex flex-col gap-2 ${wc("lg:col-start-2 lg:row-span-2 lg:row-start-1")}`}>
          <Input
            id="quick-duration"
            ref={durationRef}
            value={duration}
            onChange={(e) => {
              setDuration(e.target.value);
              setChipRun(null);
            }}
            placeholder="Time: 1.5, 1:30 or 90m"
            aria-label="Time to add"
            aria-invalid={invalid}
            inputMode="decimal"
            enterKeyHint="next"
            className="h-11 text-base"
          />
          <TimeRuler
            minutes={parsed ?? 0}
            onChange={(m) => {
              setChipRun(null);
              setDuration(m > 0 ? chipText(m) : "");
            }}
          />
          <div className="grid grid-cols-3 gap-2">
            {DURATION_CHIPS.map((c) => (
              <Button
                key={c.minutes}
                type="button"
                variant={parsed === c.minutes ? "secondary" : "outline"}
                aria-pressed={parsed === c.minutes}
                className="h-10 gap-1 rounded-full px-1 text-sm sm:text-base"
                onClick={() => {
                  // Same chip, field still untouched since the last tap: add the chip's time once more.
                  const again = chipRun?.minutes === c.minutes && parsed === c.minutes * chipRun.taps;
                  const taps = again ? chipRun.taps + 1 : 1;
                  setChipRun({ minutes: c.minutes, taps });
                  setDuration(chipText(c.minutes * taps));
                  durationRef.current?.focus();
                }}
              >
                <Plus className="size-3.5 text-amber" aria-hidden strokeWidth={3} />
                <span className="sm:hidden" aria-hidden="true">
                  {c.short}
                </span>
                <span className="max-sm:sr-only">{c.label}</span>
              </Button>
            ))}
          </div>
          <p className={`text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}>
            {invalid
              ? "Try 1.5, 1:30 or 90m"
              : parsed
                ? `Day total ${formatDuration(dayMinutes)} → ${formatDuration(dayMinutes + (parsed ?? 0))} h`
                : "Type a time or tap one (tap again to add more), then add it."}
          </p>
        </div>

        <div className={wc("lg:col-start-1 lg:row-start-2")}>
          <NoteTextarea
            value={note}
            onChange={setNote}
            polish={polishContext}
            onKeyDown={(e) => {
              // Enter saves when a time is typed, otherwise goes back to the time field.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (parsed !== null) void submit();
                else durationRef.current?.focus();
              }
            }}
            placeholder="What did you work on? (optional)"
            aria-label="Description"
            rows={2}
            className="min-h-[4.5rem] resize-none py-3 text-base"
          />
        </div>

        <button
          type="submit"
          disabled={create.isPending || parsed === null}
          // The main event: a big amber button with a plus disc, a soft glow and a lift. While no time is typed it is a
          // quiet dashed outline (not a grey slab that looks broken), and it comes alive when there is something to add.
          className={`group relative flex h-14 w-full items-center justify-center gap-3 ${wc("lg:col-start-2 lg:row-start-3")} rounded-2xl bg-amber font-display font-extrabold text-[#1b1405] text-lg shadow-[0_10px_28px_-10px_color-mix(in_oklab,var(--amber)_70%,transparent)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-10px_color-mix(in_oklab,var(--amber)_80%,transparent)] active:translate-y-0 active:scale-[0.99] disabled:translate-y-0 disabled:border-2 disabled:border-foreground/25 disabled:border-dashed disabled:bg-transparent disabled:font-bold disabled:text-foreground/60 disabled:shadow-none`}
        >
          <span className="grid size-7 place-items-center rounded-full bg-[#1b1405] text-amber transition-transform group-hover:rotate-90 group-disabled:bg-foreground/15 group-disabled:text-foreground/60">
            <Plus className="size-4" strokeWidth={3} aria-hidden />
          </span>
          Log time
          <Kbd className="hidden bg-[#1b1405]/15 text-inherit md:inline-flex">↵</Kbd>
        </button>
        {/* The timer is the second way: a quiet button under Add (a green "go" play disc, two short lines). Only for today. */}
        {isToday && (
          <button
            type="button"
            onClick={startTimer}
            disabled={start.isPending || !online}
            title={online ? undefined : "A timer needs a connection"}
            className={`group flex w-full items-center gap-3 ${wc("lg:col-start-1 lg:row-start-3")} rounded-2xl border border-[#3DDC97]/40 bg-[linear-gradient(90deg,color-mix(in_oklab,#3DDC97_14%,transparent),var(--card)_70%)] px-4 py-3 text-left transition-[border-color,transform] hover:-translate-y-0.5 hover:border-[#3DDC97] disabled:opacity-50`}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#3DDC97] text-[#08140E] shadow-[0_0_0_5px_color-mix(in_oklab,#3DDC97_24%,transparent)] transition-transform group-hover:scale-105">
              <Play className="size-4" fill="currentColor" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-bold font-display">
                {timerRunning ? "Switch timer to this" : "Start timer"}
              </span>
              <span className="block text-muted-foreground text-xs">
                Haven&apos;t done it yet? Track it as you work.
              </span>
            </span>
          </button>
        )}
        {/* At the foot, so picking a project with a budget never moves the controls above it. */}
        {budget && (
          <div className={wc("lg:col-span-2")}>
            <ClientCurrency currency={clients.data?.find((c) => c.projects.some((p) => p.id === projectId))?.currency}>
              <BudgetBar status={budget} />
            </ClientCurrency>
          </div>
        )}
      </form>
    </div>
  );
  if (bare) return body;
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Same tinted header band as every other card (see "Page and card layout" in CLAUDE.md). */}
      <div className="border-b bg-band-2 px-3 py-3 sm:px-4">
        <h2 className="font-semibold text-base">
          Log time
          {showDate && <span className="font-normal text-muted-foreground"> · {dayLabel}</span>}
        </h2>
      </div>
      {body}
    </div>
  );
}
