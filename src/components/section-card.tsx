"use client";

import { createContext, type FormEventHandler, type ReactNode, useContext } from "react";

import { cn } from "cn";

const SectionGroupContext = createContext(false);
/** Wraps cards that sit inside one grouped card (see Account's sections): they drop their own border and corners. */
export const SectionGroupProvider = SectionGroupContext.Provider;
export const useInSectionGroup = () => useContext(SectionGroupContext);

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
  const grouped = useInSectionGroup();
  return (
    <section
      className={cn(
        grouped
          ? tone === "danger" && "border-l-4 border-l-destructive/50"
          : cn("overflow-hidden rounded-xl border bg-card", tone === "danger" && "border-destructive/40"),
      )}
    >
      <div
        className={cn(
          "bg-muted/40 px-4 py-3",
          children && "border-b",
          tone === "danger" && "border-destructive/30 bg-destructive/5",
        )}
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
