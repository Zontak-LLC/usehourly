import type { MockInstance } from "vitest";

/** One JSON log line from src/lib/log.ts. */
export type LogLine = {
  event: string;
  level?: string;
  attempt?: number;
  attempts?: number;
  message: string;
  sql?: string;
  error: { name: string; message: string };
};

/** The JSON log lines named `event` that a console.error spy collected (the adapter's plain-text lines are skipped). */
export const logLines = (spy: MockInstance, event: string): LogLine[] =>
  (spy.mock.calls as unknown[][])
    .map((c) => String(c[0]))
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l))
    .filter((l) => l.event === event);
