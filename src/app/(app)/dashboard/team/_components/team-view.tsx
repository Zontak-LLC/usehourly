"use client";

import { useState } from "react";

import { Plus, UsersRound } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

import { InviteCard } from "./invite-form";
import { MemberSection } from "./member-section";
import { PeopleList } from "./people-list";
import { TeamStrip } from "./team-strip";

/** Two sides of one page: the people you invited to log time on your clients, and the teams you were invited to. */
export function TeamView() {
  const people = trpc.team.list.useQuery();
  const teams = trpc.member.teams.useQuery();
  const [inviting, setInviting] = useState(false);
  const shown = (people.data ?? []).filter((p) => p.status !== "removed");
  const active = shown.filter((p) => p.status === "active").length;
  const waiting = shown.filter((p) => p.status === "pending").length; // an expired invitation is not "waiting"
  const empty = !people.isLoading && shown.length === 0;
  return (
    <PageShell
      nav="team"
      title="Team"
      description={
        shown.length > 0
          ? `${active} on your team · ${waiting} invitation${waiting === 1 ? "" : "s"} waiting`
          : "Let someone log time on your clients, without giving them your invoices or rates."
      }
      actions={
        shown.length > 0 && (
          <Button
            type="button"
            variant="outline"
            className="h-10 gap-1.5"
            aria-label="Invite someone"
            aria-expanded={inviting}
            onClick={() => setInviting((open) => !open)}
          >
            <Plus /> Invite
          </Button>
        )
      }
    >
      {inviting && <InviteCard onClose={() => setInviting(false)} />}
      {people.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : empty ? (
        !inviting && (
          <EmptyState className="flex flex-col items-center gap-2 p-8">
            <UsersRound className="size-6" aria-hidden />
            <span className="font-medium text-foreground">Nobody on your team yet</span>
            <span className="max-w-md">
              They can log time on the clients you choose. Each person you invite gets a row here.
            </span>
            <Button type="button" variant="primary" onClick={() => setInviting(true)}>
              <Plus /> Invite someone
            </Button>
          </EmptyState>
        )
      ) : (
        <>
          <TeamStrip people={shown} />
          <PeopleList people={people.data ?? []} />
        </>
      )}
      {(teams.data?.length ?? 0) > 0 && <MemberSection teams={teams.data ?? []} />}
    </PageShell>
  );
}
