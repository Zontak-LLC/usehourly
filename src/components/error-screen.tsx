"use client";

import { useEffect } from "react";

import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * What a person sees when a page throws while rendering: plain words, a way to retry, a way out,
 * and the error's `digest` (Next's short id for the matching server log line) to quote to support.
 */
export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The browser console is the only place a client-side failure can be seen; the server logs its own.
    console.error("page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="font-semibold text-2xl">Something went wrong.</h1>
      <p className="max-w-md text-muted-foreground">
        That page didn't load. Your data is safe. Try again, and if it keeps happening, tell us what you were doing.
      </p>
      {error.digest && <p className="text-muted-foreground text-xs">Reference: {error.digest}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/today">Go to Today</Link>
        </Button>
      </div>
    </div>
  );
}
