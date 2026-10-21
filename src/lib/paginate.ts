/** How many items one page of a long list shows: a few on a phone (one swipe of scrolling), more on a wide screen. */
export const PAGE_SIZE_PHONE = 3;
export const PAGE_SIZE_DESKTOP = 10;

export type Page<T> = {
  /** The items on this page. */
  items: T[];
  /** The page shown, 1-based, kept inside the real range. */
  page: number;
  pages: number;
  /** 1-based position of the first and last item shown, 0 when there are none. */
  from: number;
  to: number;
  total: number;
};

/** Cuts `items` into pages of `size`. A page number outside the range is moved inside it (a filter shrank the list). */
export function paginate<T>(items: readonly T[], page: number, size: number): Page<T> {
  const per = Math.max(1, Math.floor(size));
  const pages = Math.max(1, Math.ceil(items.length / per));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * per;
  const shown = items.slice(start, start + per);
  return {
    items: shown,
    page: current,
    pages,
    from: shown.length ? start + 1 : 0,
    to: start + shown.length,
    total: items.length,
  };
}
