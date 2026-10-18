import type { FormEventHandler, ReactNode } from "react";

import { cn } from "cn";

/**
 * A card with a tinted header band (title and a line of explanation) and a padded body. With `onSubmit` the body is a
 * POST form, so the header stays outside it. `tone="danger"` is for the delete-account card.
 */
export function SectionCard({
  title,
  description,
  onSubmit,
  tone,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  tone?: "danger";
  children?: ReactNode;
}) {
  const body = "flex flex-col gap-3 p-4";
  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card", tone === "danger" && "border-destructive/40")}>
      <div
        className={cn("border-b bg-muted/40 px-4 py-3", tone === "danger" && "border-destructive/30 bg-destructive/5")}
      >
        <h3 className="font-semibold text-base">{title}</h3>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {children &&
        (onSubmit ? (
          <form method="post" onSubmit={onSubmit} className={body}>
            {children}
          </form>
        ) : (
          <div className={body}>{children}</div>
        ))}
    </section>
  );
}
