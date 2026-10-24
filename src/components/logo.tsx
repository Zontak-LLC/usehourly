import type { SVGProps } from "react";

/**
 * The UseHourly mark ("ten past ten", chosen 2026-10-24): a thin clock face on a solid rounded tile in the accent
 * (ocean blue), white ink in light mode and dark ink in dark mode. The previous mark was the same clock with no tile,
 * drawn in the text colour (see "Logo" in docs/ui-spec.md). Keep the geometry in step with src/app/icon.svg
 * (scripts/logo/render-icons.mjs draws every raster icon from it).
 */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
  const ink = "stroke-white dark:stroke-primary-foreground";
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="UseHourly" fill="none" strokeLinecap="round" {...props}>
      <rect width="64" height="64" rx="14" className="fill-[var(--amber)]" />
      <circle cx="32" cy="32" r="19" strokeWidth="3.5" className={ink} />
      <line x1="32" y1="32" x2="24.2" y2="27.5" strokeWidth="4" className={ink} />
      <line x1="32" y1="32" x2="43.3" y2="25.5" strokeWidth="3" className={ink} />
      <circle cx="32" cy="32" r="2.6" className="fill-white stroke-none dark:fill-primary-foreground" />
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
