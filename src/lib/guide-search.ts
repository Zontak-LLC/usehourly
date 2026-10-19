import { plainText } from "./guide-markdown";

export type Searchable = { id: string; title: string; summary: string; keywords: string[]; body: string };

const words = (s: string) => s.toLowerCase().match(/[a-z0-9$%']+/g) ?? [];

/**
 * Finds guide entries for what someone typed. Every word they type must appear somewhere (as the start of a word, so
 * "round" finds "rounding" and "rounds"); title and keyword hits count most. Best match first; an empty query finds nothing.
 */
export function searchGuide<T extends Searchable>(entries: T[], query: string): T[] {
  const terms = words(query);
  if (terms.length === 0) return [];
  const scored: { entry: T; score: number; order: number }[] = [];
  entries.forEach((entry, order) => {
    const title = words(entry.title);
    const keys = entry.keywords.flatMap(words);
    const summary = words(entry.summary);
    const body = words(plainText(entry.body));
    let score = 0;
    for (const term of terms) {
      const hit = (ws: string[]) => ws.some((w) => w.startsWith(term));
      const here = (hit(title) ? 5 : 0) + (hit(keys) ? 4 : 0) + (hit(summary) ? 2 : 0) + (hit(body) ? 1 : 0);
      if (here === 0) return;
      score += here;
    }
    scored.push({ entry, score, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((s) => s.entry);
}
