// Exemption comments. A line is exempt when it, or the line above it, carries a marker followed by a reason:
//   check-rules-ok: <reason>            (this tool's own marker; the name is configurable)
//   a Biome suppression with its reason   (so one comment covers both tools)
// A marker with nothing after the colon exempts nothing and is reported itself: a reason is the point of the comment.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {string} marker e.g. "check-rules-ok" or "colour-ok"
 * @param {{ biome?: boolean }} [opts] biome: also accept Biome's suppression comments
 */
export function exemptionMatcher(marker, { biome = false } = {}) {
  const own = new RegExp(`${escapeRe(marker)}:(.*)$`);
  const biomeRe = /biome-ignore(?:-all|-start|-end)?\s+[^:\s]+:(.*)$/;
  /** @param {string} line @returns {"none" | "ok" | "no-reason"} */
  const kind = (line) => {
    // Drop what closes a comment (`*/`, a JSX `}`), then there must be a word left.
    const hasReason = (/** @type {RegExpExecArray} */ m) =>
      /\w/.test((m[1] ?? "").replace(/\*\/.*$/, "").replace(/}+\s*$/, ""));
    const m = own.exec(line);
    if (m) return hasReason(m) ? "ok" : "no-reason";
    // Biome reports its own suppressions without a reason; here they simply exempt nothing.
    const b = biome ? biomeRe.exec(line) : null;
    return b && hasReason(b) ? "ok" : "none";
  };
  return {
    kind,
    /** @param {string[]} lines @param {number} i */
    exempt: (lines, i) => kind(lines[i] ?? "") === "ok" || (i > 0 && kind(lines[i - 1] ?? "") === "ok"),
  };
}
