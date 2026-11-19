import { cn } from "cn"

/** The box per size: sm 16 px, md 20 px, lg 32 px. */
const SIZES = {
  sm: "size-4",
  md: "size-5",
  lg: "size-8",
} as const

const SPOKE_COUNT = 12
/** One run of the wave round the ring; the class `animate-[spinner-fade_1s_…]` below says the same 1 s. */
const TURN_SECONDS = 1
const SPOKE_ANGLE_DEG = 360 / SPOKE_COUNT
/** The faintest spoke's opacity in the still picture, the same as the end of `@keyframes spinner-fade`. */
const FAINTEST = 0.25

const SPOKES = Array.from({ length: SPOKE_COUNT }, (_, i) => i)

/** Where spoke `i` is in the wave at the start, 0 (brightest) to 11/12: the bright spot then runs clockwise. */
function phase(i: number): number {
  return ((SPOKE_COUNT - i) % SPOKE_COUNT) / SPOKE_COUNT
}

/**
 * The one loading sign: a thin ring with 12 short spokes that stay still while a wave of brightness runs round them,
 * once a second (the classic Apple activity indicator). It takes the text colour, so it fits the amber fill and the
 * tint buttons in light and dark. Under reduced motion it is a still picture of the wave. Show it through
 * `useDelayedFlag` (or `Button busy`), never at once: a fast answer should show nothing.
 *
 * With a `label` it is a `role="status"` named by it; without one it is hidden from screen readers. Inside a button,
 * leave the label off and set `aria-busy` on the button, so the button keeps its own name.
 */
function Spinner({
  size = "md",
  label,
  className,
}: {
  size?: keyof typeof SIZES
  /** What a screen reader hears: "Loading", or the action ("Saving"). */
  label?: string
  className?: string
}) {
  return (
    <span
      {...(label ? { role: "status", "aria-label": label } : { "aria-hidden": true })}
      data-slot="spinner"
      data-size={size}
      className={cn(
        "relative inline-block shrink-0 rounded-full border border-[color-mix(in_oklab,currentColor_25%,transparent)] text-current",
        SIZES[size],
        className
      )}
    >
      {SPOKES.map((i) => (
        <span
          key={i}
          aria-hidden
          className="absolute inset-0"
          style={{ transform: `rotate(${i * SPOKE_ANGLE_DEG}deg)` }}
        >
          <span
            data-spinner-dash
            className="absolute top-[16%] left-1/2 h-[24%] w-[10%] -translate-x-1/2 rounded-full bg-current motion-safe:animate-[spinner-fade_1s_linear_infinite]"
            // The opacity is the still picture (reduced motion); the running animation overrides it.
            style={{
              opacity: 1 - (1 - FAINTEST) * phase(i),
              animationDelay: `-${(phase(i) * TURN_SECONDS).toFixed(3)}s`,
            }}
          />
        </span>
      ))}
    </span>
  )
}

export { Spinner }
