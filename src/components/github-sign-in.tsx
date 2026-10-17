"use client";

import { useEffect, useState } from "react";

import { signIn } from "next-auth/react";

import { GITHUB_REFUSAL } from "@/lib/github-login";
import { safeNext } from "@/lib/safe-next";
import { trpc } from "@/lib/trpc";

const ERRORS: Record<string, string> = {
  ...GITHUB_REFUSAL,
  limit: "Too many sign-ups from this connection. Please try again in a little while.",
};

/** "Continue with GitHub", shown only when the GitHub app is set up. Also explains a refused attempt. */
export function GithubSignIn() {
  const enabled = trpc.account.githubEnabled.useQuery(undefined, { staleTime: Number.POSITIVE_INFINITY });
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("error") === "github") {
      setProblem(
        ERRORS[q.get("why") ?? ""] ??
          "We couldn't sign you in with GitHub. Please try again, or use your email and password.",
      );
    }
  }, []);

  if (!enabled.data?.enabled) return null;

  return (
    <div className="space-y-3">
      {problem && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm"
        >
          {problem}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setProblem(null);
          try {
            await signIn("github", { redirectTo: safeNext(new URLSearchParams(window.location.search).get("next")) });
          } catch {
            setProblem("Couldn't reach GitHub. Check your connection and try again.");
            setBusy(false);
          }
        }}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md border bg-background font-medium text-sm hover:bg-muted disabled:opacity-60"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-5 fill-current">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
        {busy ? "Opening GitHub…" : "Continue with GitHub"}
      </button>
      <div className="flex items-center gap-3 text-muted-foreground text-xs">
        <span className="h-px flex-1 bg-border" />
        or with email
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
