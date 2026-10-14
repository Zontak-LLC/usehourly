import raw from "@/data/supporters.json";

/**
 * The people who chose to be listed as sponsors. The data file is written by
 * `npm run supporters` (scripts/update-supporters.mjs) from GitHub Sponsors, and only ever
 * holds sponsors whose GitHub sponsorship is public: someone who sponsors privately is never
 * read, so they can never appear here.
 */
export type Supporter = { name: string; url?: string };

const MAX = 200;

/** Tidy whatever is in the data file: trim, drop empties and duplicates, allow only https links. */
export function cleanSupporters(input: unknown): Supporter[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Supporter[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const name = String((item as { name?: unknown }).name ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const urlRaw = (item as { url?: unknown }).url;
    let url: string | undefined;
    try {
      const u = new URL(String(urlRaw ?? ""));
      if (u.protocol === "https:") url = u.toString();
    } catch {
      url = undefined;
    }
    out.push(url ? { name, url } : { name });
    if (out.length >= MAX) break;
  }
  return out;
}

export const SUPPORTERS: Supporter[] = cleanSupporters(raw);

const escapeMd = (s: string) => s.replace(/([\\`*_{}[\]()#+\-.!|<>])/g, "\\$1");

/** The README's thank-you list, between the supporters markers. */
export function readmeSupportersBlock(list: Supporter[], sponsorUrl: string): string {
  if (list.length === 0) {
    return `_Be the first: [sponsor UseHourly on GitHub](${sponsorUrl})._`;
  }
  return list.map((s) => (s.url ? `- [${escapeMd(s.name)}](${s.url})` : `- ${escapeMd(s.name)}`)).join("\n");
}
