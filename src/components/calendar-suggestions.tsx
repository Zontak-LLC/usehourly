"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CalendarPlus, X } from "lucide-react";
import { toast } from "sonner";

import { useGoogleCalendarClientId } from "@/components/google-calendar-config";
import { GuideLink } from "@/components/guide-link";
import { HeaderCard } from "@/components/header-card";
import { SwipeArea } from "@/components/swipe-area";
import { Button } from "@/components/ui/button";
import { useSavedCalendar } from "@/components/use-calendar";
import { type SuggestProject, suggestionsForDay } from "@/lib/calendar-suggest";
import { formatDuration } from "@/lib/duration";
import { preloadGoogleIdentity } from "@/lib/google-identity";
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
  const googleClientId = useGoogleCalendarClientId();
  const file = useRef<HTMLInputElement>(null);

  const projects: SuggestProject[] = useMemo(
    () => clients.flatMap((c) => c.projects.map((p) => ({ id: p.id, name: p.name, clientName: c.name }))),
    [clients],
  );
  const suggestions = useMemo(
    () => (cal.calendar ? suggestionsForDay(cal.calendar.events, date, projects, entries, cal.skipped) : []),
    [cal.calendar, date, projects, entries, cal.skipped],
  );

  // Google's popup must open straight from the tap, so its script is fetched as soon as the card is shown.
  useEffect(() => {
    if (googleClientId) preloadGoogleIdentity();
  }, [googleClientId]);

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
      const read = await cal.readLink(address, await myEmail());
      if (!read) return;
      const { count, truncated } = read;
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

  async function connectGoogle() {
    if (!googleClientId) return;
    try {
      const read = await cal.connectGoogle(googleClientId);
      if (!read) return;
      const { count, truncated } = read;
      toast.success(
        count === 0
          ? "Connected, but found no meetings in the last 3 months."
          : `Connected. Read ${count} meeting${count === 1 ? "" : "s"}${truncated ? " (the newest ones)" : ""}.`,
      );
    } catch (err) {
      toastError(err, "Couldn't connect Google Calendar.");
    }
  }

  async function refreshLink(quiet: boolean) {
    try {
      const read = await cal.readLink(null, await myEmail());
      if (read && !quiet) toast.success("Calendar updated.");
    } catch (err) {
      // The automatic read on opening Today stays quiet (the card shows when the calendar was last read); a press of Refresh says why.
      if (!quiet) toastError(err, "Couldn't update the calendar.");
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
        Google: Settings, your calendar, <strong>Integrate calendar</strong>,{" "}
        <strong>Secret address in iCal format</strong>. Outlook and iCloud work too. It stays in this browser.
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
  ) : null;

  if (!cal.calendar) {
    // An optional offer, not data: a dashed outline, with the ways to connect side by side in their own columns.
    return (
      <section
        aria-label="From your calendar"
        data-headerless="an optional offer, dashed on purpose"
        className="flex flex-col gap-3 rounded-xl border border-foreground/30 border-dashed p-3 sm:p-4"
      >
        <div className="flex items-center gap-2">
          <CalendarPlus className="size-5 text-muted-foreground" aria-hidden />
          <h2 className="font-semibold text-base">Turn meetings into time entries</h2>
          <GuideLink topic="calendar-suggestions" label="Time entries from your calendar" />
        </div>
        {input}
        <ul className={`grid gap-3 ${googleClientId ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {googleClientId && (
            <Way title="Google Calendar" hint="Read-only. UseHourly's servers never see it.">
              <Button type="button" className="h-10 w-full" disabled={cal.busy} onClick={connectGoogle}>
                {cal.busy ? "Connecting…" : "Connect Google Calendar"}
              </Button>
            </Way>
          )}
          <Way title="Calendar file" hint="From Google, Apple or Outlook (.ics).">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full"
              disabled={cal.busy}
              onClick={() => file.current?.click()}
            >
              {cal.busy ? "Reading…" : "Add a calendar file"}
            </Button>
          </Way>
          <Way title="Private address" hint="A secret iCal link; refreshes by itself.">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full"
              aria-expanded={typing}
              onClick={() => setTyping(!typing)}
            >
              Use a private address
            </Button>
          </Way>
        </ul>
        {linkForm}
      </section>
    );
  }

  return (
    <HeaderCard
      label="From your calendar"
      // Tinted, so the meetings waiting to be logged do not melt into the timesheet card above.
      className="border-tint-edge bg-tint"
      header={
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-base">From your calendar</h2>
          <GuideLink topic="calendar-suggestions" label="Time entries from your calendar" />
        </div>
      }
    >
      {input}

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
          onClick={() =>
            cal.google && googleClientId ? connectGoogle() : cal.link ? refreshLink(false) : file.current?.click()
          }
        >
          {cal.busy ? "Reading…" : cal.link || (cal.google && googleClientId) ? "Refresh" : "Update"}
        </button>
        <button type="button" className="py-1 underline" onClick={cal.remove}>
          {cal.google ? "Disconnect" : "Remove calendar"}
        </button>
      </p>
    </HeaderCard>
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
    // Shared by the Add button and the swipe: a second swipe while the first is still being saved must not log it twice.
    if (!projectId || create.isPending) return;
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
    <li className="py-3 first:pt-0 last:pb-0">
      {/* Swipe right to add the meeting (once a project is picked), left to skip it; the buttons do the same. */}
      <SwipeArea
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSwipe={(direction) => {
          if (direction === "left") return onSkip();
          if (!projectId) return toast.info("Pick a project first, then swipe right to add it.");
          void add();
        }}
      >
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
      </SwipeArea>
    </li>
  );
}

/** One way to connect a calendar: its own column with a title, one line of help and its button. */
function Way({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-card p-3 ring-1 ring-foreground/10">
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      <div className="mt-auto">{children}</div>
    </li>
  );
}
