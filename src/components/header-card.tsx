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
  children,
}: {
  header: ReactNode;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  className?: string;
  children?: ReactNode;
}) {
  const body = "flex flex-col gap-3 p-3 sm:p-4";
  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <header className="bg-band-2 px-3 py-3 sm:px-4">{header}</header>
      {onSubmit ? (
        <form method="post" onSubmit={onSubmit} className={body}>
          {children}
        </form>
      ) : (
        <div className={body}>{children}</div>
      )}
    </section>
  );
}
