import type { ReactNode } from "react";

import { cn } from "cn";

/** The one "nothing here yet" box: a dashed card, so an empty list looks like a card waiting to be filled. */
export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm", className)}>
      {children}
    </div>
  );
}
