"use client";

import { useState } from "react";

import { signIn } from "next-auth/react";

/** "Try the demo": makes a throwaway account with sample data and goes straight to the app. No sign-up. */
export function TryDemoButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await signIn("demo", { redirect: false });
      if (res?.error || !res?.ok) {
        setProblem(
          "We couldn't start a demo just now (a limit may have been reached). Please try again in a little while, or create a free account.",
        );
        setBusy(false);
        return;
      }
      window.location.assign("/dashboard/today");
    } catch {
      setProblem("Couldn't reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-2 sm:w-auto">
      <button type="button" onClick={start} disabled={busy} className={className}>
        {busy ? "Setting up your demo…" : children}
      </button>
      {problem && (
        <p role="alert" className="max-w-xs text-center text-destructive text-sm">
          {problem}
        </p>
      )}
    </div>
  );
}
