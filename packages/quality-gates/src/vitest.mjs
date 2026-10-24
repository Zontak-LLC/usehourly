// The coverage floor for vitest: v8 coverage with thresholds that fail the run when coverage drops under them.
// A floor, not a target: set it a few points under what you measure, and only ever raise it.
const KEYS = ["statements", "branches", "functions", "lines"];

/**
 * @param {{
 *   thresholds: { statements: number, branches: number, functions: number, lines: number },
 *   include?: string[],
 *   exclude?: string[],
 *   reporter?: string[],
 * }} opts
 */
export function coverageFloor({ thresholds, include, exclude, reporter = ["text-summary", "json-summary"] }) {
  for (const k of KEYS) {
    const v = thresholds?.[/** @type {keyof typeof thresholds} */ (k)];
    if (typeof v !== "number" || v < 0 || v > 100) {
      throw new Error(`quality-gates: coverage floor "${k}" must be a number from 0 to 100`);
    }
  }
  return { provider: /** @type {const} */ ("v8"), include, exclude, reporter, thresholds };
}
