import type { ComponentProps, ReactNode } from "react";

import { cn } from "cn";
import { Loader2 } from "lucide-react";

/**
 * A big two-line action with an icon disc, for the few actions that make a document: create an invoice, download the
 * PDF. `amber` is the main action of a screen (the amber fill); `ink` is a strong second one (a soft panel with an amber edge that glows on hover, in both themes). The icon disc turns and the whole button lifts on hover. A screen reader gets `label` as the name.
 */
export function DocButton({
  icon,
  title,
  hint,
  label,
  tone = "ink",
  busy = false,
  className,
  ...props
}: Omit<ComponentProps<"button">, "title"> & {
  icon: ReactNode;
  title: string;
  hint: string;
  /** The button's accessible name (the visible words are split over two lines). */
  label: string;
  tone?: "amber" | "ink";
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-busy={busy || undefined}
      {...props}
      className={cn(
        "group/doc relative inline-flex min-h-14 items-center gap-3 overflow-hidden rounded-2xl py-2 pr-5 pl-2 text-left outline-none transition-all duration-200 focus-visible:ring-4 focus-visible:ring-amber/40 disabled:pointer-events-none disabled:opacity-50 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98]",
        tone === "amber"
          ? "bg-amber-fill text-[#12151b] shadow-[0_1px_2px_rgb(0_0_0/0.12)] hover:brightness-105"
          : "bg-gradient-to-b from-card to-muted text-foreground shadow-[0_1px_0_rgb(255_255_255/0.06)_inset,0_10px_24px_-14px_rgb(0_0_0/0.6)] ring-1 ring-foreground/15 hover:shadow-[0_1px_0_rgb(255_255_255/0.06)_inset,0_0_0_4px_color-mix(in_oklab,var(--amber)_16%,transparent),0_16px_30px_-12px_color-mix(in_oklab,var(--amber)_45%,transparent)] hover:ring-amber/70",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl transition-transform duration-500 [&_svg]:size-5",
          // The ink button's tile is ink too: amber is kept for the main action (drawing audit, 2026-10-23).
          tone === "amber" ? "bg-[#12151b] text-amber" : "bg-foreground text-background",
        )}
      >
        {busy ? <Loader2 className="animate-spin" /> : icon}
      </span>
      <span aria-hidden className="flex flex-col leading-tight">
        <span className="font-display font-extrabold text-base">{title}</span>
        <span className="text-xs opacity-75">{hint}</span>
      </span>
    </button>
  );
}
