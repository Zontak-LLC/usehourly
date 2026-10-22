"use client";

import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

import { InviteSlot } from "./invite-slot";
import { MemberSection } from "./member-section";
import { PeopleList } from "./people-list";

/** Two sides of one page: the people you invited to log time on your clients, and the teams you were invited to. */
export function TeamView() {
  const people = trpc.team.list.useQuery();
  const teams = trpc.member.teams.useQuery();
  const shown = (people.data ?? []).filter((p) => p.status !== "removed");
  const active = shown.filter((p) => p.status === "active").length;
  const waiting = shown.filter((p) => p.status === "pending").length; // an expired invitation is not "waiting"
  return (
    <PageShell
      nav="team"
      title="Team"
      description={
        shown.length > 0
          ? `${active} on your team · ${waiting} invitation${waiting === 1 ? "" : "s"} waiting`
          : "Let someone log time on your clients, without giving them your invoices or rates."
      }
    >
      {people.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <PeopleList people={people.data ?? []} footer={<InviteSlot people={shown.length} />} />
      )}
      {(teams.data?.length ?? 0) > 0 && <MemberSection teams={teams.data ?? []} />}
    </PageShell>
  );
}
