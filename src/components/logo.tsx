import type { SVGProps } from "react";

/**
 * The UseHourly mark: a bold ink "U" on an amber tile. (It briefly had a white bar across it to read as an H too; that
 * was dropped on 2026-10-20.) The tile is always amber, so it reads the same on light and dark pages. Keep the geometry
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
