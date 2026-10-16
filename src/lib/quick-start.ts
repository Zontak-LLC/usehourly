/** One-tap durations shown under "How long?" on Today. */
export const DURATION_CHIPS = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "4 hours", minutes: 240 },
] as const;

/** Name given to the project that is created behind the scenes on first run. */
export const DEFAULT_PROJECT_NAME = "General";

/**
 * First run asks a single question ("Who do you work for?"). The answer becomes the client, and a
 * default project is created under it so time can be logged straight away. Returns null when the
 * answer is blank so the form can show a plain-words message.
 */
export function firstRunNames(answer: string): { client: string; project: string } | null {
  const client = answer.trim().replace(/\s+/g, " ").slice(0, 80);
  return client ? { client, project: DEFAULT_PROJECT_NAME } : null;
}
