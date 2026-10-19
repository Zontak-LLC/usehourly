"use client";

import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

import { InviteForm } from "./invite-form";
import { MemberSection } from "./member-section";
import { PeopleList } from "./people-list";

/** Two sides of one page: the people you invited to log time on your clients, and the teams you were invited to. */
export function TeamView() {
  const people = trpc.team.list.useQuery();
  const teams = trpc.member.teams.useQuery();
  return (
    <PageShell
      title="Team"
      description="Let someone log time on your clients, without giving them your invoices or rates."
      descriptionOnPhone
    >
      {people.isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : <PeopleList people={people.data ?? []} />}
      <InviteForm />
      {(teams.data?.length ?? 0) > 0 && <MemberSection teams={teams.data ?? []} />}
    </PageShell>
  );
}
