/**
 * Parse free-form duration text into whole minutes. Returns null when invalid.
 *   "1.5" → 90   "1:30" → 90   "90m" → 90   "2h" → 120   "1h30" / "1h 30m" → 90
 *   bare number ≤ 12 is hours ("2" → 120); larger is minutes ("45" → 45)
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) {
    const mins = Number(m[2]);
    return mins < 60 ? Number(m[1]) * 60 + mins : null;
  }

  // "2h", "90m", "1.5h", "1h30", "1h30m"
  m = s.match(/^(?:(\d+(?:\.\d+)?)h(?:ours?|rs?)?)?(?:(\d+)(?:m(?:in(?:ute)?s?)?)?)?$/);
  if (m && s.includes("h") && (m[1] || m[2])) {
    return Math.round(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0));
  }
  m = s.match(/^(\d+)m(?:in(?:ute)?s?)?$/);
  if (m) return Number(m[1]);

  m = s.match(/^(\d+(?:\.\d+)?)$/);
  if (m) {
    const n = Number(m[1]);
    return Math.round(n <= 12 ? n * 60 : n);
  }
  return null;
}

/** 90 → "1:30" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** 90 → "1.50" — decimal hours for invoicing. */
export function formatDecimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}
