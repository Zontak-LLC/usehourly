import type { SVGProps } from "react";

/**
 * The UseHourly mark: a thin clock face with an hour hand and a minute hand at ten past ten, drawn in the text colour
 * (no tile, so it stays in the background and follows light and dark mode). Keep the geometry in step with
 * src/app/icon.svg (scripts/logo/render-icons.mjs draws every raster icon from it).
 */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="UseHourly"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      {...props}
    >
      <circle cx="32" cy="32" r="24" strokeWidth="5" />
      <path d="M32 32L23 27M32 32L43 25" strokeWidth="6" />
      <circle cx="32" cy="32" r="3" fill="currentColor" stroke="none" />
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
