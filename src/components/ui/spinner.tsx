import { cn } from "cn"

const SIZES = {
  sm: "size-4",
  md: "size-6",
  lg: "size-10",
} as const

const DASHES = Array.from({ length: 12 }, (_, i) => i)

/** Where dash `i` is in the wave at the start, 0 (brightest) to 11/12: the bright spot then runs clockwise. */
function phase(i: number): number {
  return ((12 - i) % 12) / 12
}

/**
 * The one loading sign (issue 430, the owner's pick 2026-11-05): a thin ring with 12 short dashes that stay still while
 * a wave of brightness runs round them, once a second (the classic Apple activity indicator). It takes the text colour,
 * so it fits the amber fill and the tint buttons in light and dark. Under reduced motion it is a still picture of the
 * wave. Show it through `useDelayedFlag` (or `Button busy`), never at once: a fast answer should show nothing.
 */
function Spinner({
  size = "md",
  label = "Loading",
  className,
}: {
  size?: keyof typeof SIZES
  /** What a screen reader hears: "Loading", or the action ("Saving"). */
  label?: string
  className?: string
}) {
  return (
    <span
      role="status"
      aria-label={label}
      data-slot="spinner"
      data-size={size}
      className={cn(
        "relative inline-block shrink-0 rounded-full border border-[color-mix(in_oklab,currentColor_25%,transparent)] text-current",
        SIZES[size],
        className
      )}
    >
      {DASHES.map((i) => (
        <span key={i} aria-hidden className="absolute inset-0" style={{ transform: `rotate(${i * 30}deg)` }}>
          <span
            data-spinner-dash
            className="absolute top-[16%] left-1/2 h-[24%] w-[10%] -translate-x-1/2 rounded-full bg-current motion-safe:animate-[spinner-dash_1s_linear_infinite]"
            // The opacity is the still picture (reduced motion); the running animation overrides it.
            style={{ opacity: 1 - 0.75 * phase(i), animationDelay: `-${phase(i).toFixed(3)}s` }}
          />
        </span>
      ))}
    </span>
  )
}

export { Spinner }
