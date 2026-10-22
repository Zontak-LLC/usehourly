"use client";

import { useEffect, useState } from "react";

import { signIn } from "next-auth/react";

import { safeNext } from "@/lib/safe-next";
import { SOCIAL_REFUSAL } from "@/lib/social-login";
import { trpc } from "@/lib/trpc";

const ERRORS: Record<string, string> = {
  ...SOCIAL_REFUSAL,
  limit: "Too many sign-ups from this connection. Please try again in a little while.",
};

type Provider = "github" | "google";

const LABEL: Record<Provider, string> = { github: "GitHub", google: "Google" };

function Mark({ provider }: { provider: Provider }) {
  if (provider === "github") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-5 fill-current">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.28a12 12 0 0 0 0 10.76l4.01-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.28 6.62l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

/** "Continue with GitHub / Google", each shown only when that provider is set up. Also explains a refused attempt. */
export function SocialSignIn() {
  const enabled = trpc.account.socialEnabled.useQuery(undefined, { staleTime: Number.POSITIVE_INFINITY });
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // "github" is what an older link may carry
    if (q.get("error") === "social" || q.get("error") === "github") {
      setProblem(
        ERRORS[q.get("why") ?? ""] ?? "We couldn't sign you in. Please try again, or use your email and password.",
      );
    }
  }, []);

  const providers = (["google", "github"] as const).filter((p) => enabled.data?.[p]);
  // While the answer is on its way, keep the room the two buttons and the "or with email" line will take, so the form
  // does not jump down under the person's cursor when they appear.
  if (enabled.isLoading) return <div aria-hidden className="h-32" />;
  if (providers.length === 0) return null;

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
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy(provider);
            setProblem(null);
            try {
              await signIn(provider, { redirectTo: safeNext(new URLSearchParams(window.location.search).get("next")) });
            } catch {
              setProblem(`Couldn't reach ${LABEL[provider]}. Check your connection and try again.`);
              setBusy(null);
            }
          }}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md border bg-background font-medium text-sm hover:bg-muted disabled:opacity-60"
        >
          <Mark provider={provider} />
          {busy === provider ? `Opening ${LABEL[provider]}…` : `Continue with ${LABEL[provider]}`}
        </button>
      ))}
      <div className="flex items-center gap-3 text-muted-foreground text-xs">
        <span className="h-px flex-1 bg-border" />
        or with email
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
