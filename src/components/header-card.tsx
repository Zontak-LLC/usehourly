import type { FormEventHandler, ReactNode } from "react";

import { cn } from "cn";

/**
 * A card with a tinted header and a padded body, and no line between them: the tint separates the two. Use it for a
 * group of related things (a person, a form). Anything inside should be plain or a borderless tile, never another
 * framed card.
 */
export function HeaderCard({
  header,
  onSubmit,
  className,
  light = false,
  tile = false,
  children,
}: {
  header: ReactNode;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  className?: string;
  /** A white header like the page card's own header, instead of the light tint (the Week page's day card). */
  light?: boolean;
  /** For a card that sits inside another card (a person inside "Your team"): a hairline ring instead of a border, and the darkest header shade. */
  tile?: boolean;
  children?: ReactNode;
}) {
  const body = "flex flex-col gap-3 p-3 sm:p-4";
  return (
    <section
      className={cn(
        "overflow-hidden bg-card",
        tile ? "rounded-lg ring-1 ring-foreground/10" : "rounded-xl border",
        className,
      )}
    >
      <header className={cn("px-3 py-3 sm:px-4", light ? "bg-card" : tile ? "bg-band-3" : "bg-band-2")}>
        {header}
      </header>
      {!children ? null : onSubmit ? (
        <form method="post" onSubmit={onSubmit} className={body}>
          {children}
        </form>
      ) : (
        <div className={body}>{children}</div>
      )}
    </section>
  );
}
