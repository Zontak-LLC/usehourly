"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Check, ClockPlus, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { BudgetBar } from "@/components/budget-bar";
import { ClientCurrency } from "@/components/currency-provider";
import { NoteTextarea } from "@/components/note-textarea";
import { useCurrentUserId } from "@/components/offline-guard";
import { ProjectPicker } from "@/components/project-picker";
import { flyIn, glowEntry, haloColour, spin, useRoll } from "@/components/time-reward";
import { TIMER_STARTED_EVENT } from "@/components/timer-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { useOptimisticEntries } from "@/components/use-optimistic-entries";
import { fromISODate, monthBounds } from "@/lib/dates";
import { formatDuration, parseDuration } from "@/lib/duration";
import { feature } from "@/lib/features";
import { getActiveEngine } from "@/lib/local-sync/active";
import { addPending, isNetworkError } from "@/lib/offline-queue";
import { pendingEntry } from "@/lib/optimistic-entries";
import { DURATION_CHIPS } from "@/lib/quick-start";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";
import { notifyPending, useOnline } from "@/lib/use-offline";

/** What a time chip writes in the box: "30m", "1h", "1h30", "2h" (never "120m"). parseDuration reads all of them. */
function chipText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

const LAST_PROJECT_KEY = "hourly:lastProject";
/** How many entries this browser has logged: the help line under the time shows only for the first few. */
const LOGGED_KEY = "hourly:loggedCount";
const HELP_UNTIL = 3;
function readLogged(): number {
  try {
    return Number(localStorage.getItem(LOGGED_KEY)) || 0;
  } catch {
    return 0;
  }
}
function readLast(): string {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function QuickAdd({
  date,
  dayMinutes,
  showDate = true,
  bare = false,
  onTimerContext,
}: {
  date: string;
  dayMinutes: number;
  /** The Today page already shows the date in its header, so it turns this off; the day dialog keeps it. */
  showDate?: boolean;
  /** Without its own card and header: the Week page puts the form inside the day's card. */
  bare?: boolean;
  /** Today's timer is the strip above this form: it starts for the project and description picked here. */
  onTimerContext?: (context: { projectId: string; projectName: string; note: string }) => void;
}) {
  const utils = trpc.useUtils();
  const clients = trpc.clients.list.useQuery();
  const userId = useCurrentUserId();
  const online = useOnline();
  const create = trpc.entry.create.useMutation();
  const optimistic = useOptimisticEntries();

  const [projectId, setProjectId] = useState("");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  // Tapping the same chip again adds its time again (2 hours, again = 4 hours); typing or another chip starts over.
  const [chipRun, setChipRun] = useState<{ minutes: number; taps: number } | null>(null);
  const durationRef = useRef<HTMLInputElement>(null);
  const logIconRef = useRef<HTMLSpanElement>(null);
  // The reward for adding time: the field's value and the day total roll up after a chip (decoration only: the real
  // value is already set, so typing, Enter or a save never waits for it).
  const fieldRoll = useRoll();
  const dayRoll = useRoll();
  const projectLabel = useId();
  // After a save the button says what went in ("Logged 2:00") for a moment; typing a new time ends it at once.
  const [logged, setLogged] = useState<string | null>(null);
  const [loggedCount, setLoggedCount] = useState(HELP_UNTIL);
  useEffect(() => setLoggedCount(readLogged()), []);
  useEffect(() => {
    if (!logged) return;
    const id = setTimeout(() => setLogged(null), 1400);
    return () => clearTimeout(id);
  }, [logged]);

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
      setLogged(formatDuration(parsed));
      fieldRoll.stop();
      dayRoll.stop();
      setChipRun(null);
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
    spin(logIconRef.current);
    if (row) {
      finish();
      glowEntry(clientId);
    }
    try {
      await create.mutateAsync({ projectId, date, minutes: parsed, note, clientId });
      countLogged();
      await Promise.all([utils.entry.list.invalidate(), utils.project.budgets.invalidate()]);
      if (!row) finish();
    } catch (err) {
      undo?.();
      setLogged(null); // it was not logged after all
      // No connection (or the server is unreachable): keep the entry on this device and send it later.
      if (isNetworkError(err)) return saveOnDevice(clientId, parsed, finish);
      if (row) {
        setDuration(typed.duration); // give back what was typed so nothing is lost
        setNote(typed.note);
      }
      toastError(err, "Couldn't save that entry.");
    }
  }

  /** One more entry saved from this browser: the help line under the time shows only for the first few. */
  function countLogged() {
    setLoggedCount((n) => {
      try {
        localStorage.setItem(LOGGED_KEY, String(n + 1));
      } catch {
        // Only decides whether the help line shows; ignore storage being unavailable.
      }
      return n + 1;
    });
  }

  /** Keeps an entry typed without a connection on this device; OfflineSync sends it when the connection is back. */
  function saveOnDevice(clientId: string, minutes: number, finish: () => void) {
    if (!userId) return toast.error("Couldn't save that without a connection. Please try again when you're online.");
    const kept = addPending(localStorage, { clientId, userId, projectId, date, minutes, note, createdAt: Date.now() });
    if (!kept) return toast.error("Couldn't save that on this device. Please try again when you're online.");
    notifyPending();
    toast.info("No connection: saved on this device. It will be sent when you're back online.");
    countLogged();
    finish();
  }

  // Tell the page's timer what it would start for, and clear the description once a timer has started with it.
  const pickedName = projects.find((p) => p.id === projectId)?.name ?? "";
  useEffect(() => {
    onTimerContext?.({ projectId, projectName: pickedName, note });
  }, [onTimerContext, projectId, pickedName, note]);
  useEffect(() => {
    const clear = () => setNote("");
    window.addEventListener(TIMER_STARTED_EVENT, clear);
    return () => window.removeEventListener(TIMER_STARTED_EVENT, clear);
  }, []);

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

  const help = invalid
    ? "Try 1.5, 1:30 or 90m"
    : parsed
      ? `Day total ${formatDuration(dayMinutes)} → ${formatDuration(dayRoll.shown ?? dayMinutes + (parsed ?? 0))} h`
      : loggedCount < HELP_UNTIL
        ? "Type a time or tap one (tap again to add more), then add it."
        : "";
  // One layout everywhere (Today, Week's day panel, the day dialog; 2026-10-23 redesign): the time first with Log time
  // beside it from 640px (at the foot on a phone, where the thumb is), the quick times, "on" and the project pills, then
  // the description.
  const body = (
    <div className={bare ? "flex flex-col gap-3" : "flex flex-col gap-3 p-3 sm:p-4"}>
      <form method="post" onSubmit={submit} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative sm:col-start-1 sm:row-start-1">
          <Input
            id="quick-duration"
            ref={durationRef}
            value={duration}
            onChange={(e) => {
              setDuration(e.target.value);
              setLogged(null);
              setChipRun(null);
              fieldRoll.stop();
              dayRoll.stop();
            }}
            placeholder="Time: 1.5, 1:30 or 90m"
            aria-label="Time to add"
            aria-invalid={invalid}
            inputMode="decimal"
            enterKeyHint="next"
            className={`h-11 pr-11 text-base ${fieldRoll.shown !== null ? "text-transparent" : ""}`}
          />
          {/* While the value rolls up after a chip, this shows the rolling figure over the (already final) value. */}
          {fieldRoll.shown !== null && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-[calc(0.75rem+1px)] flex items-center text-base tabular-nums md:text-sm"
            >
              {chipText(fieldRoll.shown)}
            </span>
          )}
          {duration && (
            <button
              type="button"
              aria-label="Clear time"
              title="Clear time"
              onClick={() => {
                setDuration("");
                setChipRun(null);
                fieldRoll.stop();
                dayRoll.stop();
                durationRef.current?.focus();
              }}
              className="absolute inset-y-0 right-1.5 my-auto grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span className="grid size-5 place-items-center rounded-full bg-foreground/10">
                <X className="size-3" strokeWidth={3} aria-hidden />
              </span>
            </button>
          )}
        </div>

        <LogTimeButton logged={logged} disabled={create.isPending || parsed === null} iconRef={logIconRef} />

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {DURATION_CHIPS.map((c) => (
              <Button
                key={c.minutes}
                type="button"
                variant={parsed === c.minutes ? "secondary" : "outline"}
                aria-pressed={parsed === c.minutes}
                className="h-9 flex-1 gap-1 rounded-full px-3 text-sm sm:flex-none"
                onClick={(e) => {
                  // Same chip, field still untouched since the last tap: add the chip's time once more.
                  const again = chipRun?.minutes === c.minutes && parsed === c.minutes * chipRun.taps;
                  const taps = again ? chipRun.taps + 1 : 1;
                  const from = again ? c.minutes * chipRun.taps : 0;
                  const to = c.minutes * taps;
                  setChipRun({ minutes: c.minutes, taps });
                  setLogged(null);
                  setDuration(chipText(to));
                  fieldRoll.roll(from, to);
                  dayRoll.roll(dayMinutes + from, dayMinutes + to);
                  if (durationRef.current)
                    flyIn(e.currentTarget, durationRef.current, `+${c.short}`, haloColour(c.minutes));
                  durationRef.current?.focus();
                }}
              >
                <Plus className="size-3.5 text-foreground/60" aria-hidden strokeWidth={3} />
                <span className="sm:hidden" aria-hidden="true">
                  {c.short}
                </span>
                <span className="max-sm:sr-only">{c.label}</span>
              </Button>
            ))}
          </div>
          {help && (
            <p className={`text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">
              {help}
            </p>
          )}
        </div>

        <div className="flex min-w-0 items-start gap-2 sm:col-span-2">
          <span id={projectLabel} className="mt-2 shrink-0 text-muted-foreground text-sm">
            on
          </span>
          {onlyProject ? (
            <p className="mt-2 text-sm">
              <span className="font-semibold">{onlyProject.name}</span>
              <span className="text-muted-foreground"> · {onlyClient?.name}</span>
            </p>
          ) : (
            <ProjectPicker
              labelledBy={projectLabel}
              projects={(clients.data ?? []).flatMap((c) =>
                c.projects.map((p) => ({ id: p.id, name: p.name, clientName: c.name, color: c.color })),
              )}
              value={projectId}
              onChange={remember}
              onPicked={() => durationRef.current?.focus({ preventScroll: true })}
            />
          )}
        </div>

        <div className="sm:col-span-2">
          <NoteTextarea
            value={note}
            onChange={setNote}
            polish={feature("aiPolish") ? polishContext : undefined}
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
            className="min-h-[4rem] resize-none py-2.5 text-base"
          />
        </div>
        {/* At the foot, so picking a project with a budget never moves the controls above it. */}
        {budget && feature("budgets") && (
          <div className="sm:col-span-2">
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

/** The main button: amber with a clock-plus disc; just after a save it says what went in ("Logged 2:00") with a check. */
function LogTimeButton({
  logged,
  disabled,
  iconRef,
}: {
  logged: string | null;
  disabled: boolean;
  iconRef: React.RefObject<HTMLSpanElement | null>;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      // The main event: a calm amber fill with a clock-plus disc (time going in); no glow or lift since 2026-10-23. While no time is typed
      // it is a pale amber (still the main button, only waiting: drawing audit 2026-10-23), and it comes alive when there
      // is something to add. After a save it says what went in.
      // Just after a save the field is empty (so the button is off), but it stays amber for the moment it says "Logged".
      style={logged ? { backgroundColor: "var(--amber-fill)" } : undefined}
      className="group relative order-last flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-amber-fill px-6 font-bold font-display text-lg text-white dark:text-[var(--background)] shadow-[0_1px_2px_rgb(0_0_0/0.12)] transition-[filter,transform] hover:brightness-105 active:scale-[0.99] disabled:bg-amber-soft disabled:text-foreground/60 disabled:shadow-none sm:order-none sm:col-start-2 sm:row-start-1 sm:h-11 sm:w-auto sm:text-base"
    >
      <span
        ref={iconRef}
        className="grid size-7 place-items-center rounded-full bg-white/20 text-white transition-transform group-hover:-rotate-12 group-disabled:bg-foreground/10 group-disabled:text-foreground/60 dark:bg-background/25 dark:text-background sm:size-6"
      >
        {logged ? (
          <Check className="size-4" strokeWidth={3} aria-hidden />
        ) : (
          <ClockPlus className="size-4" strokeWidth={2.5} aria-hidden />
        )}
      </span>
      {/* The name stays "Log time" for screen readers and tests; the eyes see what was logged for a moment. */}
      <span className="sr-only">Log time</span>
      <span aria-hidden="true">{logged ? `Logged ${logged}` : "Log time"}</span>
      <Kbd className="hidden bg-[#12151b]/15 text-inherit lg:inline-flex">↵</Kbd>
    </button>
  );
}
