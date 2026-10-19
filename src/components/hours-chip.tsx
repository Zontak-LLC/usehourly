import type { ReactNode } from "react";

import { cn } from "cn";
import { Clock } from "lucide-react";

/**
 * Hours with the clock, as a flat label: a light tint, no outline, no white fill. It is not clickable, so it must not
 * look like the outlined buttons beside it (those are controls: white with a border; this is information).
 */
export function HoursChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md bg-foreground/[0.07] px-2.5 font-mono font-semibold tabular-nums",
        className,
      )}
    >
      <Clock className="size-3.5 text-foreground/60" aria-hidden />
      {children}
    </span>
  );
}
