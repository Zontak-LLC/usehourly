"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Upload } from "lucide-react";

import { Notice } from "@/components/notice";
import { useCurrentUserId } from "@/components/offline-guard";
import { safe } from "@/components/support-notice";
import { Button } from "@/components/ui/button";
import { feature } from "@/lib/features";
import { firstEntryLogged, IMPORT_HINT_HREF, importHintKey, showImportHint } from "@/lib/import-hint";
import { trpc } from "@/lib/trpc";

/**
 * "Coming from Toggl, Clockify or Harvest?" on Today, for accounts with no entries yet (issue 326). `hasEntries` is
 * `entry.hasAny`, started by `TodayView` with the first batch; `weekHasEntries` is the week Today already holds, so the
 * note goes at once after the first log. The note waits while that week is still loading (`weekLoaded`). "Not now" is
 * remembered in this browser per account.
 */
export function ImportHint({
  hasEntries,
  weekLoaded,
  weekHasEntries,
}: {
  hasEntries: boolean | undefined;
  weekLoaded: boolean;
  weekHasEntries: boolean;
}) {
  const userId = useCurrentUserId();
  const utils = trpc.useUtils();
  const key = userId ? importHintKey(userId) : null;
  const [dismissed, setDismissed] = useState(true); // hidden until we know, so it never flashes
  useEffect(() => {
    setDismissed(key === null || safe(() => localStorage.getItem(key) === "1", false));
  }, [key]);
  // The first entry was just logged: keep the cached answer true, so another week with no time doesn't bring it back.
  useEffect(() => {
    if (firstEntryLogged({ hasEntries, weekHasEntries })) utils.entry.hasAny.setData(undefined, true);
  }, [weekHasEntries, hasEntries, utils]);

  if (!showImportHint({ importOn: feature("importTime"), hasEntries, weekLoaded, weekHasEntries, dismissed })) {
    return null;
  }
  return (
    <Notice
      role="note"
      aria-label="Import your history"
      className="flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-center"
    >
      <p className="flex-1">Coming from Toggl, Clockify or Harvest?</p>
      <div className="flex gap-2">
        <Link
          href={IMPORT_HINT_HREF}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border bg-background px-4 font-medium text-sm transition-colors hover:bg-muted"
        >
          <Upload className="size-4" aria-hidden />
          Import your history
        </Link>
        <Button
          type="button"
          variant="ghost"
          className="h-10"
          onClick={() => {
            if (key) safe(() => localStorage.setItem(key, "1"), undefined);
            setDismissed(true);
          }}
        >
          Not now
        </Button>
      </div>
    </Notice>
  );
}
