"use client";

import { createContext, type FormEventHandler, type ReactNode, useContext } from "react";

import { cn } from "cn";

import { CardTitle } from "@/components/card-title";

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
          // Inside an Account section the section's own band is the only one: its cards keep a plain heading.
          grouped ? "px-4 pt-4" : cn("bg-band-2 px-4 py-3", children && "border-b"),
          tone === "danger" && "border-destructive/30 bg-destructive/5",
        )}
      >
        {typeof title === "string" ? (
          <CardTitle as="h3" title={title} note={typeof description === "string" ? description : undefined} />
        ) : (
          <>
            <h3 className="font-semibold text-base">{title}</h3>
            {description && <p className="text-foreground/75 text-sm">{description}</p>}
          </>
        )}
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
