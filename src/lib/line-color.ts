import { PALETTE } from "@/lib/palette";

/**
 * A project's colour as a bright line: a gradient from the colour to a lighter shade of it, with a soft glow. It is used on
 * the thin "by project" bars of the Today page so they catch the eye.
 */
export const brightLine = (color: string) => ({
  backgroundImage: `linear-gradient(90deg, ${color}, color-mix(in oklab, ${color} 60%, #ffffff))`,
  boxShadow: `0 0 10px -1px color-mix(in oklab, ${color} 55%, transparent)`,
});

/** The brand blend (amber, coral, pink, violet) as one gradient, the same as the home page headline. */
export const BRAND_BLEND = `linear-gradient(90deg, ${PALETTE.brandBlend.join(", ")})`;

/**
 * The slice of ONE shared brand-blend gradient that belongs to a piece of a bar: the piece starts `start` (0 to 1) of the
 * way along and is `share` (0 to 1) wide. Pieces laid side by side then read as one continuous multicolour line.
 */
export function blendSlice(start: number, share: number) {
  const w = Math.min(1, Math.max(0.0001, share));
  return {
    backgroundImage: BRAND_BLEND,
    backgroundSize: `${100 / w}% 100%`,
    backgroundPosition: `${w >= 1 ? 0 : (start / (1 - w)) * 100}% 0`,
    backgroundRepeat: "no-repeat",
  };
}
