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
  async function answer(allow: boolean) {
    setProblem(null);
    try {
      // Read-only unless the person picks otherwise, whatever the app asked for.
      const chosen = access ?? "read";
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

  if (inspect.isLoading || notSignedIn) {
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
  if (inspect.data?.kind === "redirect") {
    // The app's own request was malformed. Nothing is sent anywhere until the person chooses to go back.
    return frame(
      <div className="space-y-3">
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          This connection request could not be completed. The app sent something UseHourly does not accept.
        </div>
        <a
          href={inspect.data.url}
          rel="noopener noreferrer"
          className="inline-block rounded-md border px-3 py-2 text-sm underline"
        >
          Go back to {inspect.data.host}
        </a>
      </div>,
    );
  }
  if (inspect.data?.kind !== "ok") return null;

  const data = inspect.data;
  const chosen = access ?? "read";
  return frame(
    <>
      <div className="space-y-2">
        <h1 className="font-semibold text-2xl tracking-tight">Connect {data.clientName}?</h1>
        <p className="text-muted-foreground text-sm">
          <strong className="text-foreground">{data.clientName}</strong> wants to use your UseHourly account (
          {data.email}). If you allow it, you will be sent back to{" "}
          <strong className="text-foreground">{data.redirectHost}</strong>.
        </p>
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <p className="font-medium">Unverified app</p>
          <p className="mt-1 text-muted-foreground">
            This app registered itself and chose its own name. UseHourly has not checked who made it. It will be sent
            to:
          </p>
          <code className="mt-1 block break-all">{data.redirectUri}</code>
        </div>
        {data.requested === "write" && (
          <p className="text-muted-foreground text-xs">
            The app asked to be able to change your data. "Read only" is selected: choose "Read and change" only if you
            want that.
          </p>
        )}
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
