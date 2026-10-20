"use client";

import { useEffect, useRef, useState } from "react";

import { Play } from "lucide-react";
import { toast } from "sonner";

import { BudgetBar } from "@/components/budget-bar";
import { ClientCurrency } from "@/components/currency-provider";
import { NoteTextarea } from "@/components/note-textarea";
import { useCurrentUserId } from "@/components/offline-guard";
import { ProjectPicker } from "@/components/project-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { useOptimisticEntries } from "@/components/use-optimistic-entries";
import { fromISODate, monthBounds } from "@/lib/dates";
import { formatDuration, parseDuration } from "@/lib/duration";
import { addPending, isNetworkError } from "@/lib/offline-queue";
import { pendingEntry } from "@/lib/optimistic-entries";
import { DURATION_CHIPS } from "@/lib/quick-start";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";
import { notifyPending, useOnline } from "@/lib/use-offline";
import { useToday } from "@/lib/use-today";

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
}: {
  date: string;
  timerRunning: boolean;
  dayMinutes: number;
  /** The Today page already shows the date in its header, so it turns this off; the day dialog keeps it. */
  showDate?: boolean;
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
    if (window.matchMedia("(pointer: fine)").matches) durationRef.current?.focus();
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
    if (!online) return saveOnDevice(clientId, parsed, finish);
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

  const dayLabel = fromISODate(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const onlyProject = projects.length === 1 ? projects[0] : null;
  const onlyClient = onlyProject ? clients.data?.find((c) => c.projects.some((p) => p.id === onlyProject.id)) : null;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Same tinted header band as every other card (see "Page and card layout" in CLAUDE.md). */}
      <div className="border-b bg-band-2 px-3 py-3 sm:px-4">
        <h2 className="font-semibold text-base">
          Add to the day
          {showDate && <span className="font-normal text-muted-foreground"> · {dayLabel}</span>}
        </h2>
      </div>

      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <form method="post" onSubmit={submit} className="flex flex-col gap-2.5">
          {onlyProject ? (
            <p className="text-base">
              {onlyClient?.name} · {onlyProject.name}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p id="quick-project-label" className="font-medium text-sm">
                Pick your project
              </p>
              <ProjectPicker
                projects={(clients.data ?? []).flatMap((c) =>
                  c.projects.map((p) => ({ id: p.id, name: p.name, clientName: c.name })),
                )}
                value={projectId}
                onChange={remember}
              />
            </div>
          )}

          {budget && (
            <ClientCurrency currency={clients.data?.find((c) => c.projects.some((p) => p.id === projectId))?.currency}>
              <BudgetBar status={budget} />
            </ClientCurrency>
          )}

          <div className="flex flex-col gap-2">
            <Input
              id="quick-duration"
              ref={durationRef}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Time: 1.5, 1:30 or 90m"
              aria-label="Time to add"
              aria-invalid={invalid}
              inputMode="decimal"
              enterKeyHint="next"
              className="h-11 text-base"
            />
            <div className="grid grid-cols-5 gap-2">
              {DURATION_CHIPS.map((c) => (
                <Button
                  key={c.minutes}
                  type="button"
                  variant={parsed === c.minutes ? "secondary" : "outline"}
                  aria-pressed={parsed === c.minutes}
                  className="h-9 px-1 text-sm sm:h-10 sm:text-base"
                  onClick={() => {
                    setDuration(`${c.minutes}m`);
                    durationRef.current?.focus();
                  }}
                >
                  <span className="sm:hidden" aria-hidden="true">
                    {c.short}
                  </span>
                  <span className="max-sm:sr-only">{c.label}</span>
                </Button>
              ))}
            </div>
            {(invalid || parsed) && (
              <p className={`text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}>
                {invalid
                  ? "Try 1.5, 1:30 or 90m"
                  : `Day total ${formatDuration(dayMinutes)} → ${formatDuration(dayMinutes + (parsed ?? 0))} h`}
              </p>
            )}
          </div>

          <NoteTextarea
            value={note}
            onChange={setNote}
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
            rows={1}
            className="min-h-12 resize-none py-3 text-base"
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="submit"
              size="lg"
              variant="primary"
              disabled={create.isPending || parsed === null}
              className="h-12 w-full text-base sm:flex-1"
            >
              Add to the day <Kbd className="ml-1 hidden bg-foreground/10 text-foreground md:inline-flex">↵</Kbd>
            </Button>
            {/* A timer only makes sense for today; on another day the row is just Add to the day. */}
            {isToday && (
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={startTimer}
                disabled={start.isPending || !online}
                title={online ? undefined : "A timer needs a connection"}
                className="h-12 w-full text-base sm:w-auto sm:px-6"
              >
                <Play className="size-4" /> {timerRunning ? "Switch timer to this" : "Start timer"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
