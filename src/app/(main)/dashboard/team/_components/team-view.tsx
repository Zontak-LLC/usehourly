"use client";

import { UsersRound } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
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
      {people.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (people.data ?? []).some((p) => p.status !== "removed") ? (
        <PeopleList people={people.data ?? []} />
      ) : (
        <EmptyState className="flex flex-col items-center gap-2 py-10">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            <UsersRound className="size-6" aria-hidden />
          </span>
          <p className="font-medium text-foreground">Nobody on your team yet</p>
          <p className="max-w-md">
            Invite someone below and they can log time on the clients you choose. Each person you invite gets a card
            here.
          </p>
        </EmptyState>
      )}
      <InviteForm />
      {(teams.data?.length ?? 0) > 0 && <MemberSection teams={teams.data ?? []} />}
    </PageShell>
  );
}
