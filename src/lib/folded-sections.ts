/** Which foldable sections the person closed or opened by hand, kept on this device (`hourly:foldedSections`). */
export const FOLDED_KEY = "hourly:foldedSections";

/** Reads the saved choices; anything damaged reads as "no choices" (every section then follows its default). */
export function readFolded(raw: string | null): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(raw ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [id, open] of Object.entries(parsed)) if (typeof open === "boolean") out[id] = open;
    return out;
  } catch {
    return {};
  }
}
