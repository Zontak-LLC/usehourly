import type { SVGProps } from "react";

/**
 * The UseHourly mark: a clock face (an ink ring) with an hour hand and a minute hand at ten past ten, on an amber
 * tile. The tile is always amber, so it reads the same on light and dark pages. Keep the geometry in step with
 * src/app/icon.svg (scripts/logo/render-icons.mjs draws every icon from it).
 */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="UseHourly" {...props}>
      <rect width="64" height="64" rx="15" fill="#f5a524" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="#111" strokeWidth="5" />
      <path d="M32 32L21.6 26M32 32L45.9 24" fill="none" stroke="#111" strokeWidth="6" strokeLinecap="round" />
      <circle cx="32" cy="32" r="4" fill="#111" />
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
