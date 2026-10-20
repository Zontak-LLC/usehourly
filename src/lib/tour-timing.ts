/** How the product tour on the landing page is paced. Pure, so the numbers are tested rather than remembered. */
export const TOUR_HOLD_MS = 1600; // a page that fits whole still gets this long to be read
export const TOUR_START_MS = 1400; // a longer page rests at the top first
export const TOUR_END_MS = 1000; // and at the bottom after scrolling
export const TOUR_SWIPE_MS = 800; // the slide to the next page
export const TOUR_MIN_SCROLL_MS = 3500;
export const TOUR_MS_PER_PX = 5;

/** How far a picture of `imageHeight` has to scroll inside a screen of `screenHeight` (0 when it fits). */
export const scrollDistance = (imageHeight: number, screenHeight: number) => Math.max(0, imageHeight - screenHeight);

/** How long that scroll takes: slow enough to read, never faster than TOUR_MIN_SCROLL_MS. */
export const scrollDuration = (distance: number) => Math.max(TOUR_MIN_SCROLL_MS, distance * TOUR_MS_PER_PX);

/** The page after `i`, wrapping round to the first. */
export const nextIndex = (i: number, count: number) => (count <= 0 ? 0 : (i + 1) % count);

/** Ease in and out, 0 to 1. */
export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
