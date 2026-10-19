import type { ElementType } from "react";

import { cn } from "cn";

/**
 * The title of a card that sits INSIDE the page card: the name and its one-line note side by side ("By quarter · Handy
 * for quarterly estimated tax payments."), wrapping the note under the name where there is no room (a phone). No icon:
 * icons belong to the page card's header only, so the inner headers stay quiet and the page does not turn into a
 * row of symbols.
 */
export function CardTitle({
  title,
  note,
  as: Heading = "h2",
  id,
  className,
}: {
  title: string;
  note?: string;
  as?: ElementType;
  id?: string;
  className?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <Heading id={id} className={cn("font-semibold text-base", className)}>
        {title}
      </Heading>
      {note && <p className="text-foreground/75 text-sm">{note}</p>}
    </div>
  );
}
