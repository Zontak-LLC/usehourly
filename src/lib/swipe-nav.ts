/** The pages of the phone tab bar, in the order of its buttons. Account is a tab only on a phone 480px wide or more. */
export const SWIPE_PAGES = [
  "/dashboard/today",
  "/dashboard/week",
  "/dashboard/month",
  "/dashboard/invoices",
  "/dashboard/clients",
] as const;
const ACCOUNT_PAGE = "/dashboard/account";

/** How far the thumb must travel, how straight, and how fast, for a swipe to count. */
const MIN_DISTANCE = 80;
const MAX_MS = 700;
/** The screen's edges belong to the system's back gesture. */
const EDGE = 24;

export type Swipe = {
  pathname: string;
  /** Finger travel in pixels: negative dx = a swipe to the left. */
  dx: number;
  dy: number;
  ms: number;
  /** Where the finger first touched, and how wide the screen is. */
  startX: number;
  width: number;
};

/** A swipe's direction when it passes the gate (far enough, mostly sideways, quick, not from a screen edge), else null. */
export function swipeDirection({ dx, dy, ms, startX, width }: Omit<Swipe, "pathname">): "left" | "right" | null {
  if (Math.abs(dx) < MIN_DISTANCE) return null;
  if (Math.abs(dx) < 2 * Math.abs(dy)) return null; // mostly vertical: the person is scrolling
  if (ms > MAX_MS) return null;
  if (startX < EDGE || startX > width - EDGE) return null;
  return dx < 0 ? "left" : "right";
}

export function swipePages(width: number): string[] {
  return width >= 480 ? [...SWIPE_PAGES, ACCOUNT_PAGE] : [...SWIPE_PAGES];
}

/**
 * Where a swipe should go, or null for "stay here": a swipe to the left moves to the next tab, to the right to the
 * previous one, and nothing happens past either end, on a page that is not a tab, or when the gesture is a scroll, a
 * slow drag or a start at the screen's edge.
 */
export function swipeTarget({ pathname, ...swipe }: Swipe): string | null {
  const direction = swipeDirection(swipe);
  if (!direction) return null;
  const pages = swipePages(swipe.width);
  const here = pages.indexOf(pathname.replace(/\/$/, ""));
  if (here === -1) return null;
  return pages[here + (direction === "left" ? 1 : -1)] ?? null;
}
