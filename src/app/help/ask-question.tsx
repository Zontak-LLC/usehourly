"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import Link from "next/link";

import { TRPCClientError } from "@trpc/client";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { HELP_QUESTION_COUNT_FROM, HELP_QUESTION_MAX, SUPPORT_EMAIL } from "@/lib/help-question";
import { isNetworkError } from "@/lib/offline-queue";
import { trpc } from "@/lib/trpc";

const PILL =
  "inline-flex min-h-10 shrink-0 items-center self-start rounded-full border bg-card px-4 font-medium text-sm hover:bg-background";

const writeToUs = (
  <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4">
    {SUPPORT_EMAIL}
  </a>
);

/** What a refused send says. The server's words, except where a mail link helps or the server's text is masked. */
function problemFor(err: unknown): ReactNode {
  if (isNetworkError(err)) return "No connection. That needs you to be online.";
  const code = err instanceof TRPCClientError ? err.data?.code : undefined;
  if (code === "PRECONDITION_FAILED") return <>Email isn't set up on this server yet. Please write to {writeToUs}.</>;
  // The server's own message for a failed send never reaches the browser (internal errors are masked), so it is here.
  if (code === "INTERNAL_SERVER_ERROR" || !(err instanceof Error))
    return <>Couldn't send it right now. Please try again in a minute, or write to {writeToUs}.</>;
  return err.message;
}

/**
 * "Still stuck?" at the foot of Help (issue 375): a signed-in person types a question and UseHourly emails it to support;
 * the server adds their name and address from the account, so the page (kept by the service worker, also after sign-out)
 * never holds either. A visitor, or a cached page whose session has ended, gets a sign-in link instead of the form.
 */
export function AskQuestion({ signedIn }: { signedIn: boolean }) {
  const [mode, setMode] = useState<"closed" | "open" | "sent">("closed");
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<ReactNode>(null);
  const [sessionGone, setSessionGone] = useState(false);
  const ask = trpc.help.ask.useMutation();
  const field = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // Opening the form puts the cursor in the box.
  useEffect(() => {
    if (mode === "open") box.current?.focus();
  }, [mode]);

  const open = (fresh: boolean) => {
    if (fresh) setText("");
    setProblem(null);
    setMode("open");
  };
  const close = () => {
    setMode("closed");
    setProblem(null);
    requestAnimationFrame(() => opener.current?.focus());
  };

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || ask.isPending) return;
    setProblem(null);
    try {
      await ask.mutateAsync({ text });
      setText("");
      setMode("sent");
    } catch (err) {
      if (err instanceof TRPCClientError && err.data?.code === "UNAUTHORIZED") setSessionGone(true);
      else setProblem(problemFor(err));
    }
  }

  const canAsk = signedIn && !sessionGone;
  return (
    <aside
      aria-labelledby="still-stuck"
      className={cn(
        "flex flex-col gap-1 rounded-3xl bg-muted/60 p-5",
        (!canAsk || mode === "closed") && "sm:flex-row sm:items-center sm:justify-between sm:gap-4",
      )}
    >
      <div>
        <p id="still-stuck" className="font-semibold">
          Still stuck?
        </p>
        <p className="text-muted-foreground text-sm">Tell us in plain words what you did and what you expected.</p>
      </div>
      {!canAsk ? (
        <Link href="/auth/v2/login?next=/help" className={cn(PILL, "mt-2 sm:mt-0 sm:self-auto")}>
          Sign in to ask a question
        </Link>
      ) : mode === "closed" ? (
        <button
          ref={opener}
          type="button"
          onClick={() => open(false)}
          className={cn(PILL, "mt-2 sm:mt-0 sm:self-auto")}
        >
          Ask a question
        </button>
      ) : mode === "sent" ? (
        <div className="mt-3 flex flex-col gap-2">
          <p role="status" className="font-medium">
            Thanks, we got it. We'll answer by email.
          </p>
          <button type="button" onClick={() => open(true)} className={PILL}>
            Ask another question
          </button>
        </div>
      ) : (
        <form method="post" onSubmit={send} className="mt-3 flex flex-col gap-2">
          <label htmlFor={field} className="font-medium text-sm">
            What did you do, and what did you expect?
          </label>
          <Textarea
            id={field}
            ref={box}
            rows={5}
            value={text}
            maxLength={HELP_QUESTION_MAX}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && close()}
            aria-describedby={problem ? `${field}-problem` : undefined}
            className="field-sizing-fixed min-h-28 bg-card"
          />
          {text.length >= HELP_QUESTION_COUNT_FROM && (
            <p className="text-right text-muted-foreground text-xs">
              {text.length.toLocaleString("en-US")} of {HELP_QUESTION_MAX.toLocaleString("en-US")}
            </p>
          )}
          {problem && (
            <p id={`${field}-problem`} role="alert" className="text-destructive text-sm">
              {problem}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={!text.trim() || ask.isPending}>
              {ask.isPending ? "Sending…" : "Send"}
            </Button>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </aside>
  );
}
