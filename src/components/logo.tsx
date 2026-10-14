import type { SVGProps } from "react";

/**
 * The UseHourly mark: an "H" inside a stopwatch, its crossbar in amber. The tile is always dark, so it
 * reads the same on light and dark pages. Keep the geometry in step with src/app/icon.svg.
 */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="UseHourly" {...props}>
      <rect width="64" height="64" rx="15" fill="#111" />
      <circle cx="32" cy="33" r="19" fill="none" stroke="#fff" strokeWidth="4" />
      <path d="M32 6v7" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M25.5 26v14M38.5 26v14" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M25.5 33h13" stroke="#f5a524" strokeWidth="4" strokeLinecap="round" />
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
