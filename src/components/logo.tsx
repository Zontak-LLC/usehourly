import type { SVGProps } from "react";

/**
 * The UseHourly mark: a bold ink "U" on an amber tile with a white bar across it, so it reads as the U of "Use" and
 * the H of "Hourly" at once. The tile is always amber, so it reads the same on light and dark pages. Keep the geometry
 * in step with src/app/icon.svg (scripts/logo/render-icons.mjs draws every icon from it).
 */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="UseHourly" {...props}>
      <rect width="64" height="64" rx="15" fill="#f5a524" />
      <path
        d="M20 13v23a12 12 0 0 0 24 0v-23"
        fill="none"
        stroke="#111"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M20 26h24" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
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
