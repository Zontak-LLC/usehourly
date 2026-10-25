/**
 * The year the Year summary opens on: `?year=2025` (the emailed summary's button) opens that year; anything else, or a
 * year in the future, opens this year. `thisYear` comes from the browser clock (the Worker runs in UTC).
 */
export function reportYear(search: string, thisYear: number): number {
  const asked = Number(new URLSearchParams(search).get("year"));
  return Number.isInteger(asked) && asked >= 2000 && asked <= thisYear ? asked : thisYear;
}
