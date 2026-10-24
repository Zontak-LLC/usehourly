import type { SVGProps } from "react";

/** The hexagon with rounded corners (stroke-linejoin round on a stroke of the same colour), viewBox 0 0 100 100. */
const HEX_PATH = "M50,5 L89,27.5 V72.5 L50,95 L11,72.5 V27.5 Z";

/**
 * The UseHourly mark, the "Hex Clock" (chosen 2026-10-24): the Zontak LLC hexagon (the studio's Hex Crest family) in
 * the accent, with a clock at ten past ten inside in the on-accent colour (white in light mode, dark ink in dark mode).
 * Theme tokens only, so the light/dark switch follows. Keep the geometry in step with src/app/icon.svg,
 * scripts/logo/render-icons.mjs (every raster icon) and the inline copies in scripts/social (see "Logo" in docs/ui-spec.md).
 */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
  const ink = "stroke-white dark:stroke-primary-foreground";
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="UseHourly" fill="none" strokeLinecap="round" {...props}>
      <path d={HEX_PATH} strokeWidth="6" strokeLinejoin="round" className="fill-[var(--amber)] stroke-[var(--amber)]" />
      <circle cx="50" cy="50" r="25" strokeWidth="4.5" className={ink} />
      <path d="M50,50 L39,42 M50,50 L63,36" strokeWidth="5" className={ink} />
      <circle cx="50" cy="50" r="3.4" className="fill-white stroke-none dark:fill-primary-foreground" />
    </svg>
  );
}

/** Mark plus the name, for headers. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold ${className}`}>
      <LogoMark className="size-7" aria-hidden />
      <span>UseHourly</span>
    </span>
  );
}
