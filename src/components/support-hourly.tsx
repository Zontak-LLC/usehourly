import { Heart } from "lucide-react";

import { DONATE_PLATFORM, donateUrl } from "@/lib/donate";

/** "Support Hourly": renders nothing until a donation address is set in src/lib/donate.ts. */
export function SupportHourly({ variant = "card" }: { variant?: "band" | "card" }) {
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
      Support Hourly on {DONATE_PLATFORM}
    </a>
  );

  if (variant === "band") {
    return (
      <section className="border-t">
        <div className="mx-auto max-w-3xl px-6 py-14 text-center md:py-20">
          <h2 className="font-semibold text-2xl tracking-tight md:text-3xl">Hourly is free.</h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-muted-foreground">
            No paywall, no ads. If it saves you time, you can chip in to keep it running.
          </p>
          <div className="mt-6">{button}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-medium">Support Hourly</h2>
        <p className="text-muted-foreground text-sm">
          Hourly is free, with no paywall and no ads. If it saves you time, you can chip in to keep it running.
        </p>
      </div>
      <div className="self-start">{button}</div>
    </section>
  );
}
