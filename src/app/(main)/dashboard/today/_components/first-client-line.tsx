"use client";

import Link from "next/link";

import type { FirstClient } from "./first-run";

/**
 * Right after first run, at the top of the Log time card, once: what was made and where it lives (2026-11-06: testers
 * did not see that the first question had made a client, and could not find where projects go). Goes away with the
 * first entry or "Got it".
 */
export function FirstClientLine({ made, onDismiss }: { made: FirstClient; onDismiss: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-muted py-1 pr-1 pl-3 text-sm">
      <p role="status" className="py-1.5">
        {made.client} is your first client, with the project {made.project}. Set a rate or add projects on{" "}
        <Link href={`/dashboard/clients/${made.clientId}`} className="font-medium underline underline-offset-4">
          Clients
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="inline-flex min-h-11 items-center rounded-full px-3 font-medium text-sm hover:bg-background sm:min-h-9"
      >
        Got it
      </button>
    </div>
  );
}
