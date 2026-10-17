import { formatDecimalHours, formatDuration, parseDuration } from "@/lib/duration";

export type CalcLine = { text: string; minutes: number | null };

/** One line per entry: "1:30", "2h", "45m", "1.5". Blank lines are ignored; unreadable ones are flagged. */
export function readLines(input: string): CalcLine[] {
  return input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text) => ({ text, minutes: parseDuration(text) }));
}

export function summarize(lines: CalcLine[], rate: number | null) {
  const good = lines.filter((l): l is CalcLine & { minutes: number } => l.minutes !== null);
  const minutes = good.reduce((s, l) => s + l.minutes, 0);
  return {
    minutes,
    unreadable: lines.length - good.length,
    clock: formatDuration(minutes),
    decimal: formatDecimalHours(minutes),
    amountCents: rate !== null && rate >= 0 ? Math.round((minutes * Math.round(rate * 100)) / 60) : null,
  };
}
