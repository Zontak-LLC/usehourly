"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { TRPCClientError } from "@trpc/client";

import { LogoMark } from "@/components/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { signOutOfDevice } from "@/lib/sign-out";
import { trpc } from "@/lib/trpc";

/**
 * The page an invitation link opens: sign in if needed, then one button to join. The link is claimed only on that click.
 * It says which account is signed in, with a way to switch (log out and come straight back here), because the invited
 * person is often signed in as someone else: an owner trying their own invitation, or a work invitation opened in a
 * browser that holds a personal account.
 */
export function JoinView({ token }: { token: string }) {
  // A protected query doubles as the "are you signed in?" check, as on the app-connect screen; it also tells us who.
  const me = trpc.account.me.useQuery(undefined, { retry: false });
  const accept = trpc.member.accept.useMutation();
  const [joined, setJoined] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const notSignedIn = me.error instanceof TRPCClientError && me.error.data?.code === "UNAUTHORIZED";
  useEffect(() => {
    if (notSignedIn) {
      window.location.replace(`/auth/v2/login?next=${encodeURIComponent(`/team/join/${token}`)}`);
    }
  }, [notSignedIn, token]);

  /** Logs this account out, forgetting its saved copy on the device, and returns to this same invitation to sign in as the right person. */
  const useDifferentAccount = () =>
    signOutOfDevice({ callbackUrl: `/auth/v2/login?next=${encodeURIComponent(`/team/join/${token}`)}` });

  async function join() {
    setProblem(null);
    try {
      const res = await accept.mutateAsync({ token });
      setJoined(res.ownerName);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 font-semibold text-lg">
        <LogoMark className="size-7" />
        UseHourly
      </div>
      {me.isLoading || notSignedIn ? (
        <p className="text-muted-foreground">One moment…</p>
      ) : joined ? (
        <div className="space-y-4">
          <h1 className="font-semibold text-xl">You're on {joined}'s team</h1>
          <p className="text-muted-foreground text-sm">You can log time on the clients they chose for you.</p>
          <Link href="/dashboard/team" className={buttonVariants({ variant: "primary" })}>
            Open the Team page
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <h1 className="font-semibold text-xl">Join a team</h1>
          <p className="text-muted-foreground text-sm">
            Someone invited you to log time on their clients in UseHourly. You will see only the clients they choose,
            and never their rates, invoices or other people's time. They can remove you at any time.
          </p>
          {problem && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
              {problem}
            </div>
          )}
          <Button type="button" variant="primary" onClick={join} disabled={accept.isPending}>
            Join the team
          </Button>
          {me.data && (
            <p className="text-muted-foreground text-sm">
              Signed in as <span className="font-medium text-foreground">{me.data.email}</span>.{" "}
              <button type="button" className="py-1 underline" onClick={useDifferentAccount}>
                Use a different account
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
