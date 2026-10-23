import type { ComponentType, ReactNode } from "react";

/**
 * The head of every "Your data" panel: a small icon in a circle, a title and a short intro. It replaces the big
 * illustrations (they pushed the form down and looked wrong at half a browser width). The job comes right below it.
 */
export function DataPanelHead({
  icon: Icon,
  title,
  children,
  danger = false,
  aside,
}: {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  /** The short intro (one or two plain sentences). */
  children: ReactNode;
  danger?: boolean;
  /** Something small to the right of the title (a help link). */
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <span
        aria-hidden
        className={`grid size-11 shrink-0 place-items-center rounded-full ${
          danger ? "bg-destructive/12 text-destructive" : "bg-muted text-foreground"
        }`}
      >
        <Icon className="size-5" />
      </span>
      <div className="grid min-w-0 gap-1.5">
        <h3 className="inline-flex flex-wrap items-center gap-2 font-bold font-display text-xl leading-tight">
          {title}
          {aside}
        </h3>
        <p className="max-w-prose text-foreground/75 text-sm leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
