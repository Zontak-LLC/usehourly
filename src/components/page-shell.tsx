import type { ReactNode } from "react";

/**
 * The one frame every dashboard page uses (the Week page set the pattern): a single main card with a tinted header
 * band (title, a line of explanation, the page's main controls) and all of the page's content inside it. On a phone
 * the card runs edge to edge. The surface is tinted and the borders inside it are a notch darker (a local --border)
 * so white cards stand out from it. Content sits directly on the card's surface: cards go one level deep, never inside
 * another card, so use plain sections (a heading, a divider, spacing) for anything that would be a third level.
 */
export function PageShell({
  title,
  description,
  descriptionOnPhone = false,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** The one-line description is hidden on phones to save room; set this when it carries information (the date). */
  descriptionOnPhone?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col overflow-hidden border bg-muted/60 [--border:color-mix(in_oklch,var(--foreground)_16%,var(--background))] max-sm:-m-2 max-sm:w-[calc(100%+1rem)] max-sm:border-x-0 sm:rounded-2xl">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b bg-muted px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <h1 className="font-semibold text-xl">{title}</h1>
          {description && (
            <p className={`text-muted-foreground text-sm ${descriptionOnPhone ? "" : "max-sm:hidden"}`}>
              {description}
            </p>
          )}
        </div>
        {actions}
      </header>
      <div className="flex flex-col gap-3 p-1 sm:gap-4 sm:p-4">{children}</div>
    </div>
  );
}
