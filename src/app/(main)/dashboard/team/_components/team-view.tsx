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
  return (
    <PageShell
      nav="team"
      title="Team"
      description="Let someone log time on your clients, without giving them your invoices or rates."
      descriptionOnPhone
    >
      {shown.length > 0 && (
        <dl className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="rounded-xl border bg-card px-3 py-3">
            <dt className="text-muted-foreground text-xs">On your team</dt>
            <dd className="font-mono font-semibold text-base tabular-nums sm:text-xl">{active}</dd>
          </div>
          <div className="rounded-xl border bg-card px-3 py-3">
            <dt className="text-muted-foreground text-xs">Invitations waiting</dt>
            <dd className="font-mono font-semibold text-base tabular-nums sm:text-xl">{shown.length - active}</dd>
          </div>
        </dl>
      )}
      {people.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <PeopleList people={people.data ?? []} footer={<InviteSlot empty={shown.length === 0} />} />
      )}
      {(teams.data?.length ?? 0) > 0 && <MemberSection teams={teams.data ?? []} />}
    </PageShell>
  );
}
