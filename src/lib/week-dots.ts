/**
 * Which clients' colours to show as dots on each day tile of the Week page: one dot per client that has time that day
 * (the one with the most time first), at most `max`. A day with no entries has no dots, so an empty day shows nothing.
 */
export function dayDots(
  entries: { date: string; minutes: number; project: { client: { name: string; color: string } } }[],
  max = 3,
): Record<string, string[]> {
  const perDay = new Map<string, Map<string, { color: string; minutes: number }>>();
  for (const e of entries) {
    const day = perDay.get(e.date) ?? new Map();
    const client = day.get(e.project.client.name) ?? { color: e.project.client.color, minutes: 0 };
    client.minutes += e.minutes;
    day.set(e.project.client.name, client);
    perDay.set(e.date, day);
  }
  const out: Record<string, string[]> = {};
  for (const [date, clients] of perDay) {
    out[date] = [...clients.values()]
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, max)
      .map((c) => c.color);
  }
  return out;
}
