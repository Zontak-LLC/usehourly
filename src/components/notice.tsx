import type { ComponentProps } from "react";

import { cn } from "cn";

/**
 * A short message set apart from the text around it (a confirmation, a heads-up, a failure to load): one shape for all
 * of them, the same corners as a card. `danger` is for something that went wrong.
 */
export function Notice({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"div"> & { tone?: "neutral" | "danger" }) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3 text-sm",
        tone === "danger" && "border-destructive/40 text-destructive",
        className,
      )}
      {...props}
    />
  );
}
