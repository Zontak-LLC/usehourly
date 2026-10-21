"use client";

import { useEffect, useState } from "react";

import { usePathname } from "next/navigation";

import { Heart } from "lucide-react";

import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { supportNoticeDismissKey, supportNoticeText } from "@/lib/support-notice";

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/**
 * The owner's "chip in" note, on Today only. The server decides whether it exists (`cost` is null when it is off) and
 * whether there is somewhere to send people (`url`); this only shows it, and remembers a "Not now" in this browser
 * for that amount.
 */
export function SupportNotice({ cost, url }: { cost: number | null; url: string | null }) {
  const onToday = usePathname() === "/dashboard/today";
  const [dismissed, setDismissed] = useState(true); // hidden until we know, so it never flashes
  useEffect(() => {
    if (cost !== null) setDismissed(safe(() => localStorage.getItem(supportNoticeDismissKey(cost)) === "1", false));
  }, [cost]);

  if (cost === null || !url || !onToday || dismissed) return null;
  return (
    <Notice
      role="note"
      aria-label="Support UseHourly"
      className="mx-auto mb-3 flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-center"
    >
      <p className="flex-1">{supportNoticeText(cost)}</p>
      <div className="flex gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border bg-background px-4 font-medium text-sm transition-colors hover:bg-muted"
        >
          <Heart className="size-4 text-rose-500" aria-hidden />
          Chip in
        </a>
        <Button
          type="button"
          variant="ghost"
          className="h-10"
          onClick={() => {
            safe(() => localStorage.setItem(supportNoticeDismissKey(cost), "1"), undefined);
            setDismissed(true);
          }}
        >
          Not now
        </Button>
      </div>
    </Notice>
  );
}
