"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CalendarPlus, X } from "lucide-react";
import { toast } from "sonner";

import { GuideLink } from "@/components/guide-link";
import { Button } from "@/components/ui/button";
import { useSavedCalendar } from "@/components/use-calendar";
import { type SuggestProject, suggestionsForDay } from "@/lib/calendar-suggest";
import { formatDuration } from "@/lib/duration";
import type { ClientWithProjects } from "@/lib/optimistic-entries";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
/** A connected calendar is read again when Today opens and the last read is older than this. */
const STALE_MS = 30 * 60 * 1000;

/**
 * "From your calendar" on Today (issue #99): the meetings of the day shown, each with a project (guessed from its title
 * when it names one clearly), a one-tap Add that logs it, and Skip. Nothing is added without a tap. The calendar is a
 * file the person imports here; it is read in the browser and only recent meetings are kept on this device.
 */
export function CalendarSuggestions({
  date,
  entries,
  clients,
}: {
  date: string;
  entries: readonly { note: string; minutes: number }[];
  clients: readonly ClientWithProjects[];
}) {
  const utils = trpc.useUtils();
  const cal = useSavedCalendar();
  const file = useRef<HTMLInputElement>(null);

  const projects: SuggestProject[] = useMemo(
    () => clients.flatMap((c) => c.projects.map((p) => ({ id: p.id, name: p.name, clientName: c.name }))),
    [clients],
  );
  const suggestions = useMemo(
    () => (cal.calendar ? suggestionsForDay(cal.calendar.events, date, projects, entries, cal.skipped) : []),
    [cal.calendar, date, projects, entries, cal.skipped],
  );

  const [typing, setTyping] = useState(false);
  const [address, setAddress] = useState("");
  // The person's own address (to leave out meetings they declined) is asked for only when a calendar is read, so opening Today stays one request.
  const myEmail = () =>
    utils.account.me.fetch().then(
      (me) => me.email,
      () => null,
    );

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { count, truncated } = await cal.readLink(address, await myEmail());
      setAddress("");
      setTyping(false);
      toast.success(
        count === 0
          ? "Connected, but found no meetings in the last 3 months."
          : `Connected. Read ${count} meeting${count === 1 ? "" : "s"}${truncated ? " (the newest ones)" : ""}.`,
      );
    } catch (err) {
      toastError(err, "Couldn't read that calendar.");
    }
  }

  async function refreshLink(quiet: boolean) {
    try {
      await cal.readLink(null, await myEmail());
      if (!quiet) toast.success("Calendar updated.");
    } catch (err) {
      toastError(err, "Couldn't update the calendar.");
    }
  }

  // Once per visit: if a connected calendar was read a while ago, read it again so new meetings appear by themselves.
  const checkedStale = useRef(false);
  const staleRefresh = useRef(refreshLink);
  staleRefresh.current = refreshLink;
  const readAt = cal.calendar?.importedAt;
  useEffect(() => {
    if (checkedStale.current || !cal.link || readAt === undefined) return;
    checkedStale.current = true;
    if (Date.now() - readAt > STALE_MS) void staleRefresh.current(true);
  }, [cal.link, readAt]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const { count, truncated } = await cal.importFile(f, await myEmail());
      toast.success(
        count === 0
          ? "Read the calendar, but found no meetings in the last 3 months."
          : `Read ${count} meeting${count === 1 ? "" : "s"}${truncated ? " (the newest ones)" : ""}.`,
      );
    } catch (err) {
      toastError(err, "Couldn't read that file.");
    }
  }

  const input = (
    <input
      ref={file}
      type="file"
      accept=".ics,text/calendar"
      className="sr-only"
      tabIndex={-1}
      aria-label="Choose calendar file"
      onChange={pick}
    />
  );

  const linkForm = typing ? (
    <form method="post" onSubmit={connect} className="flex flex-col gap-2 border-t pt-3">
      <label htmlFor="calendar-address" className="font-medium text-sm">
        Private calendar address
      </label>
      <p className="text-muted-foreground text-xs">
        Google Calendar: Settings, your calendar, <strong>Integrate calendar</strong>, then copy the{" "}
        <strong>Secret address in iCal format</strong>. Outlook and iCloud work too. Anyone with this address can read
        the calendar, so it is only kept in this browser.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="calendar-address"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/…"
          className="h-10 min-w-0 flex-1 rounded-lg border bg-card px-3 text-sm"
        />
        <Button type="submit" size="sm" className="h-10" disabled={cal.busy || !address.trim()}>
          {cal.busy ? "Connecting…" : "Connect"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-10" onClick={() => setTyping(false)}>
          Cancel
        </Button>
      </div>
    </form>
  ) : (
    <button
      type="button"
      className="self-start py-1 text-muted-foreground text-xs underline"
      onClick={() => setTyping(true)}
    >
      Or connect with a private calendar address
    </button>
  );

  if (!cal.calendar) {
    return (
      <section aria-label="From your calendar" className="flex flex-col gap-2 rounded-xl border bg-card p-4">
        {input}
        <div className="flex items-center gap-2">
          <h2 className="font-medium text-sm">Turn meetings into time entries</h2>
          <GuideLink topic="calendar-suggestions" label="Time entries from your calendar" />
        </div>
        <p className="text-muted-foreground text-sm">
          Add a calendar file (.ics) from Google, Apple or Outlook Calendar and each day shows its meetings ready to log
          in one tap. It is read on this device. Only recent meetings' titles and times are kept, here, and nothing is
          added unless you tap Add.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={cal.busy}
          onClick={() => file.current?.click()}
        >
          <CalendarPlus aria-hidden /> {cal.busy ? "Reading…" : "Add a calendar file"}
        </Button>
        {linkForm}
      </section>
    );
  }

  return (
    <section aria-label="From your calendar" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      {input}
      <div className="flex items-center gap-2">
        <h2 className="font-medium text-sm">From your calendar</h2>
        <GuideLink topic="calendar-suggestions" label="Time entries from your calendar" />
      </div>

      {suggestions.length === 0 ? (
        <p className="text-muted-foreground text-sm">No meetings to log for this day.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {suggestions.map((s) => (
            <SuggestionRow key={s.id} suggestion={s} date={date} clients={clients} onSkip={() => cal.skip(s.id)} />
          ))}
        </ul>
      )}

      <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
        <span>
          {cal.calendar.name}, read {day.format(cal.calendar.importedAt)}.
        </span>
        <button
          type="button"
          className="py-1 underline"
          disabled={cal.busy}
          onClick={() => (cal.link ? refreshLink(false) : file.current?.click())}
        >
          {cal.busy ? "Reading…" : cal.link ? "Refresh" : "Update"}
        </button>
        <button type="button" className="py-1 underline" onClick={cal.remove}>
          Remove calendar
        </button>
      </p>
    </section>
  );
}

function SuggestionRow({
  suggestion: s,
  date,
  clients,
  onSkip,
}: {
  suggestion: ReturnType<typeof suggestionsForDay>[number];
  date: string;
  clients: readonly ClientWithProjects[];
  onSkip: () => void;
}) {
  const utils = trpc.useUtils();
  const create = trpc.entry.create.useMutation();
  const [projectId, setProjectId] = useState(s.projectId ?? "");

  async function add() {
    if (!projectId) return;
    try {
      await create.mutateAsync({
        projectId,
        date,
        minutes: Math.min(s.minutes, 24 * 60),
        note: s.title,
        clientId: crypto.randomUUID(),
      });
      await Promise.all([utils.entry.list.invalidate(), utils.project.budgets.invalidate()]);
    } catch (err) {
      toastError(err, "Couldn't add that.");
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm" title={s.title}>
          {s.title}
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {time.format(s.start)} · {formatDuration(s.minutes)}
        </p>
      </div>
      <select
        aria-label={`Project for ${s.title}`}
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        className="h-10 rounded-lg border bg-card px-2 text-sm sm:max-w-48"
      >
        <option value="">Pick a project</option>
        {clients.map((c) => (
          <optgroup key={c.id} label={c.name}>
            {c.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="flex gap-2">
        <Button type="button" size="sm" className="h-10" disabled={!projectId || create.isPending} onClick={add}>
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-10"
          onClick={onSkip}
          aria-label={`Skip ${s.title}`}
        >
          <X aria-hidden /> Skip
        </Button>
      </div>
    </li>
  );
}
