import { Heart } from "lucide-react";

import { SectionCard } from "@/components/section-card";
import { DONATE_PLATFORM, donateUrl } from "@/lib/donate";

/** "Support UseHourly": renders nothing until a donation address is set in src/lib/donate.ts. */
export function SupportHourly({ variant = "card" }: { variant?: "band" | "card" | "line" }) {
  const url = donateUrl();
  if (!url) return null;

  const button = (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border bg-background px-5 font-medium text-foreground text-sm transition-colors hover:bg-muted"
    >
      <Heart className="size-4 text-rose-500" aria-hidden />
      Support UseHourly on {DONATE_PLATFORM}
    </a>
  );

  if (variant === "band") {
    return (
      <section className="border-t">
        <div className="mx-auto max-w-3xl px-6 py-14 text-center md:py-20">
          <h2 className="font-semibold text-2xl tracking-tight md:text-3xl">UseHourly is free.</h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-muted-foreground">
            No paywall, no ads. If it saves you time, you can chip in to keep it running.
          </p>
          <div className="mt-6">{button}</div>
        </div>
      </section>
    );
  }

  if (variant === "line") {
    // A slim footer line for the Account page: it says it once and offers the link, with no card around it.
    return (
      <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 text-muted-foreground text-sm">
        <span>UseHourly is free, with no paywall and no ads. If it saves you time, you can chip in.</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border bg-card px-3 font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Heart className="size-4 text-rose-500" aria-hidden />
          Support on {DONATE_PLATFORM}
        </a>
      </p>
    );
  }

  return (
    <SectionCard
      title="Support UseHourly with a donation"
      description="UseHourly is free, with no paywall and no ads. If it saves you time, you can chip in to keep it running."
    >
      <div className="self-start">{button}</div>
    </SectionCard>
  );
}
