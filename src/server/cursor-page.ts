import { z } from "zod";

/** The `cursor` a paged read takes: the previous page's `nextCursor`, or nothing for the first page. */
export const cursorInput = z.string().max(100).nullish();

/** One page of a cursor-paged read. `nextCursor` is the id the next page starts at, or null on the last page. */
export type CursorPage<T> = { items: T[]; nextCursor: string | null };

/**
 * The Prisma `findMany` arguments for one page of `size` rows starting at `cursor` (the first page without one). It
 * asks for one extra row, which only says whether another page follows (see `toPage`). The order passed with it must
 * end with `{ id: "asc" }`, so rows that tie on every other key keep one order across pages.
 */
export function cursorArgs(cursor: string | null | undefined, size: number) {
  return { take: size + 1, ...(cursor ? { cursor: { id: cursor }, skip: 0 } : {}) };
}

/**
 * Cuts the `size + 1` rows `cursorArgs` asked for into the page and the next page's cursor: the extra row's id when
 * there is one, else null.
 */
export function toPage<T extends { id: string }>(rows: T[], size: number): CursorPage<T> {
  const hasMore = rows.length > size;
  return { items: hasMore ? rows.slice(0, size) : rows, nextCursor: hasMore ? rows[size].id : null };
}
