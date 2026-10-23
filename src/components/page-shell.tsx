import type { ReactNode } from "react";

import { SwipeArea, type SwipeDirection } from "@/components/swipe-area";
import { adminLinks, navLinks } from "@/navigation/sidebar/sidebar-items";

/**
 * The one frame every dashboard page uses (the Week page set the pattern): a single main card with a tinted header
 * band (title, a line of explanation, the page's main controls) and all of the page's content inside it. On a phone
 * the card runs edge to edge. The surface is tinted and the borders inside it are a notch darker (a local --border)
 * so white cards stand out from it. Content sits directly on the card's surface: cards go one level deep, never inside
 * another card, so use plain sections (a heading, a divider, spacing) for anything that would be a third level.
 */
export function PageShell({
  nav,
  title,
  description,
  descriptionOnPhone = false,
  inlineDescription = false,
  actions,
  onSwipe,
  children,
}: {
  /** The page's id in the menu (sidebar-items.ts): its icon is shown before the title, so the header always matches the navigation. */
  nav?: string;
  title: ReactNode;
  description?: ReactNode;
  /** The one-line description is hidden on phones to save room; set this when it carries information (the date). */
  descriptionOnPhone?: boolean;
  /** Put the description on the title's line (baseline-aligned) instead of under it. */
  inlineDescription?: boolean;
  actions?: ReactNode;
  /** A sideways swipe on the page body (phones): left = next, right = previous (a day, a month). Without it the swipe changes tab. */
  onSwipe?: (direction: SwipeDirection) => void;
  children?: ReactNode;
}) {
  const Icon = nav ? [...navLinks, ...adminLinks].find((l) => l.id === nav)?.icon : undefined;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col overflow-clip border bg-muted/60 [--border:color-mix(in_oklab,var(--foreground)_16%,var(--background))] max-sm:-m-2 max-sm:w-[calc(100%+1rem)] max-sm:border-x-0 sm:rounded-2xl">
      <header
        className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b bg-card px-3 py-3 sm:px-4`}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {Icon && (
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card text-foreground/80`}
            >
              <Icon className="size-5" aria-hidden />
            </span>
          )}
          <div className={inlineDescription ? "flex min-w-0 items-baseline gap-x-2" : "min-w-0"}>
            <h1 className={`font-semibold text-[clamp(1.375rem,6.5vw,2.25rem)] leading-10`}>{title}</h1>
            {description && (
              <p
                className={`text-foreground/75 text-sm ${inlineDescription ? "shrink-0" : ""} ${descriptionOnPhone ? "" : "max-sm:hidden"}`}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        {actions}
      </header>
      {onSwipe ? (
        <SwipeArea onSwipe={onSwipe} className="flex flex-1 flex-col gap-3 p-1 sm:gap-4 sm:p-4">
          {children}
        </SwipeArea>
      ) : (
        <div className="flex flex-col gap-3 p-1 sm:gap-4 sm:p-4">{children}</div>
      )}
    </div>
  );
}
