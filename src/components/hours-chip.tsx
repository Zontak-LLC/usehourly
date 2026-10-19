import type { ReactNode } from "react";

import { cn } from "cn";
import { Clock } from "lucide-react";

/**
 * Hours with the clock, in a small framed chip that matches the little icon buttons beside it. It is a label, not a
 * control: it is not clickable.
 */
export function HoursChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 font-mono font-semibold tabular-nums",
        className,
      )}
    >
      <Clock className="size-4" aria-hidden />
      {children}
    </span>
  );
}
