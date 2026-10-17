"use client";

import { useEffect, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import { TRPCClientError } from "@trpc/client";

import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const KEYS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const;

/** The consent screen: which app wants in, where it will be sent back to, and how much it may do. */
export function AuthorizeView() {
  // useSearchParams, not window.location: right after logging in the page opens through a client-side
  // navigation, and the browser's address is not updated yet when this first renders.
  const search = useSearchParams();
  const params = useMemo(
    () => Object.fromEntries(KEYS.flatMap((k) => (search.get(k) ? [[k, search.get(k) as string]] : []))),
    [search],
  );
  const inspect = trpc.oauth.inspect.useQuery(params, { retry: false });
  const decide = trpc.oauth.decide.useMutation();
  const [access, setAccess] = useState<"read" | "write" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const notSignedIn = inspect.error instanceof TRPCClientError && inspect.error.data?.code === "UNAUTHORIZED";
  useEffect(() => {
    if (notSignedIn) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/auth/v2/login?next=${next}`);
    }
  }, [notSignedIn]);
  // A client that sent the user back to its own address with an error: carry on there.
  useEffect(() => {
    if (inspect.data?.kind === "redirect") window.location.replace(inspect.data.url);
  }, [inspect.data]);

  async function answer(allow: boolean) {
    setProblem(null);
    try {
      const chosen = access ?? (inspect.data?.kind === "ok" ? inspect.data.requested : "read");
      const res = await decide.mutateAsync({ params, allow, access: chosen });
      setLeaving(true);
      window.location.assign(res.redirectUrl);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  const frame = (children: React.ReactNode) => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 font-semibold text-lg">
        <LogoMark className="size-7" />
        UseHourly
      </div>
      {children}
    </div>
  );

  if (inspect.isLoading || notSignedIn || inspect.data?.kind === "redirect") {
    return frame(<p className="text-muted-foreground">One moment…</p>);
  }
  if (inspect.error) {
    return frame(
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {inspect.error.message}
      </div>,
    );
  }
  if (inspect.data?.kind === "fatal") {
    return frame(
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {inspect.data.message}
      </div>,
    );
  }
  if (inspect.data?.kind !== "ok") return null;

  const data = inspect.data;
  const chosen = access ?? data.requested;
  return frame(
    <>
      <div className="space-y-2">
        <h1 className="font-semibold text-2xl tracking-tight">Connect {data.clientName}?</h1>
        <p className="text-muted-foreground text-sm">
          <strong className="text-foreground">{data.clientName}</strong> wants to use your UseHourly account (
          {data.email}). If you allow it, you will be sent back to{" "}
          <strong className="text-foreground">{data.redirectHost}</strong>.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium text-sm">What may it do?</legend>
        {(
          [
            ["read", "Read only", "See your clients, projects, time and invoices. Change nothing."],
            ["write", "Read and change", "Also log time, edit entries, make and delete invoices."],
          ] as const
        ).map(([value, label, help]) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-foreground"
          >
            <input
              type="radio"
              name="access"
              className="mt-1"
              checked={chosen === value}
              onChange={() => setAccess(value)}
            />
            <span>
              <span className="block font-medium text-sm">{label}</span>
              <span className="block text-muted-foreground text-sm">{help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="text-muted-foreground text-xs">
        Only continue if you just started this from an app you trust. You can end its access any time under Account, AI
        assistants, and it stops working if you change your password.
      </p>
      {problem && (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
      <div className="flex gap-3">
        <Button onClick={() => answer(true)} disabled={decide.isPending || leaving}>
          {leaving ? "Sending you back…" : "Allow"}
        </Button>
        <Button variant="outline" onClick={() => answer(false)} disabled={decide.isPending || leaving}>
          Cancel
        </Button>
      </div>
    </>,
  );
}
