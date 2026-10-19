import type { ReactNode } from "react";

import { cn } from "cn";
import { Clock } from "lucide-react";

/**
 * Hours with a small clock, as plain text: no pill, no tint, no outline. It is not clickable, so it must not look like
 * the outlined buttons beside it (those are controls: white with a border; this is just information).
 */
export function HoursChip({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** A word before the figure, like "Total", so it is clear what the time is the total of. */
  label?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono font-semibold tabular-nums", className)}>
      <Clock className="size-3.5 text-foreground/60" aria-hidden />
      {label && <span className="font-normal font-sans text-foreground/75">{label}</span>}
      {children}
    </span>
  );
}
