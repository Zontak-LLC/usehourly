import { toISODate } from "../src/lib/dates";

/**
 * Today's LOCAL date (YYYY-MM-DD), the same day the app shows: the browser and the test run on the same machine, in the
 * same time zone. Never the UTC date, which is tomorrow in the evening in US time zones (issue 310). Kept apart from
 * helpers.ts (which loads Playwright and the database) so a vitest scenario can import it.
 */
export const today = () => toISODate(new Date());
