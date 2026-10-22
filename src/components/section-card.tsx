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
  const grouped = useInSectionGroup();
  const body = grouped ? "flex flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6" : "flex flex-col gap-3 p-4";
  return (
    <section
      className={cn(
        grouped
          ? cn(
              "rounded-3xl bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10",
              tone === "danger" && "ring-destructive/40",
            )
          : cn(
              "overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-sheet)]",
              tone === "danger" && "border-destructive/40",
            ),
      )}
    >
      <div
        className={cn(
          // Inside an Account section a card is a soft sheet: an amber tick, then a display heading.
          grouped ? "px-5 pt-5 pb-3 sm:px-6 sm:pt-6" : cn("bg-band-2 px-4 py-3", children && "border-b"),
          tone === "danger" && "border-destructive/30 bg-destructive/5",
        )}
      >
        {grouped && (
          <span
            aria-hidden
            className={cn("mb-3 block h-1 w-10 rounded-full", tone === "danger" ? "bg-destructive" : "bg-amber")}
          />
        )}
        {typeof title === "string" ? (
          <CardTitle
            as="h3"
            title={title}
            note={typeof description === "string" ? description : undefined}
            className={grouped ? "font-display font-extrabold text-xl" : undefined}
          />
        ) : (
          <>
            <h3 className={cn("font-semibold text-base", grouped && "font-display font-extrabold text-xl")}>{title}</h3>
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
