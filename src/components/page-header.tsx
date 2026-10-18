import type { ReactNode } from "react";

/**
 * The card at the top of every page: a tinted band with the title, a line of explanation and the page's main controls
 * (`actions`), then an optional body (toolbar, figures, search) under it. Every page uses this so they open the same way.
 */
export function PageHeader({
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
    <header className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 border-b bg-muted/40 px-4 py-3 max-sm:py-2.5 sm:px-5">
        <div className="min-w-0">
          <h1 className="font-semibold text-xl">{title}</h1>
          {description && (
            <p className={`text-muted-foreground text-sm ${descriptionOnPhone ? "" : "max-sm:hidden"}`}>
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children && <div className="flex flex-col gap-4 p-4 sm:p-5">{children}</div>}
    </header>
  );
}
