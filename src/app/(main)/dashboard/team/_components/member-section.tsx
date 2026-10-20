"use client";

import { useState } from "react";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { HeaderCard } from "@/components/header-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDuration, parseDuration } from "@/lib/duration";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";
import { useToday } from "@/lib/use-today";

type Team = {
  id: string;
  ownerName: string;
  clients: { id: string; name: string; projects: { id: string; name: string }[] }[];
};

/** Teams this person was invited to: log time for the owner, see and delete your own entries. Nothing else. */
export function MemberSection({ teams }: { teams: Team[] }) {
  return (
    <>
      {teams.map((t) => (
        <TeamLog key={t.id} team={t} />
      ))}
    </>
  );
}

function monthRange(today: string) {
  return { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-31` };
}

function TeamLog({ team }: { team: Team }) {
  const utils = trpc.useUtils();
  const today = useToday();
  const log = trpc.member.log.useMutation();
  const del = trpc.member.deleteEntry.useMutation();
  const leave = trpc.member.leave.useMutation();
  const projects = team.clients.flatMap((c) => c.projects.map((p) => ({ ...p, client: c.name })));
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const range = today ? monthRange(today) : null;
  const mine = trpc.member.myEntries.useQuery(
    { teamId: team.id, ...(range ?? { from: "", to: "" }) },
    { enabled: !!range },
  );
  const refresh = () => utils.member.myEntries.invalidate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!today) return;
    const minutes = parseDuration(duration);
    if (minutes === null || minutes < 1) return toast.error("Couldn't read that duration. Try 1.5, 1:30 or 90m.");
    try {
      await log.mutateAsync({ teamId: team.id, projectId, date: today, minutes, note, clientId: crypto.randomUUID() });
      setDuration("");
      setNote("");
      await refresh();
      toast.success("Logged.");
    } catch (err) {
      toastError(err, "Couldn't log that.");
    }
  }

  async function remove(id: string) {
    try {
      await del.mutateAsync({ teamId: team.id, id });
      await refresh();
    } catch (err) {
      toastError(err, "Couldn't delete that entry.");
    }
  }

  async function stop() {
    try {
      await leave.mutateAsync({ teamId: team.id });
      await Promise.all([utils.member.teams.invalidate(), refresh()]);
    } catch (err) {
      toastError(err, "Couldn't leave the team.");
    }
  }

  return (
    <HeaderCard
      header={
        <div>
          <h2 className="font-semibold text-base">Log time for {team.ownerName}</h2>
          <p className="text-muted-foreground text-sm">
            You can add and delete your own entries here. You can't see their rates, invoices or other people's time.
          </p>
        </div>
      }
      onSubmit={submit}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`proj-${team.id}`}>Project</Label>
          <select
            id={`proj-${team.id}`}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-10 rounded-md border bg-background px-2 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.client} · {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`dur-${team.id}`}>Time</Label>
          <Input
            id={`dur-${team.id}`}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="1.5"
            inputMode="text"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`note-${team.id}`}>Description</Label>
        <Input id={`note-${team.id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={log.isPending || !projectId || !duration.trim()}>
          Add to the day
        </Button>
        <Button type="button" variant="outline" onClick={stop}>
          Leave this team
        </Button>
      </div>
      {(mine.data?.length ?? 0) > 0 && (
        <ul className="flex flex-col gap-2">
          {mine.data?.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-card ring-1 ring-foreground/10 px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium">{formatDuration(e.minutes)}</span> · {e.client} · {e.project} · {e.date}
                {e.note && <span className="block truncate text-muted-foreground">{e.note}</span>}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Delete ${formatDuration(e.minutes)} on ${e.date}`}
                onClick={() => remove(e.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </HeaderCard>
  );
}
