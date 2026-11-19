/** At most this many pages per list, so a server that keeps sending a cursor cannot loop forever. */
const MAX_PAGES = 200;

/**
 * Every row of a cursor-paged list (`entry.listAll`, `expense.listAll`, `invoice.listAll`, `invoice.listPage`), fetched
 * a page at a time so no single response is huge. Kept apart from the export code so the server can use it without
 * the zip and workbook code.
 */
export async function fetchAllPages<T>(
  fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchPage(cursor);
    all.push(...res.items);
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return all;
}
