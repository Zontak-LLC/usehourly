/** What `withTimeout` rejects with, so a caller can tell "took too long" from a real error. */
export class TimeLimitError extends Error {
  constructor(label: string, ms: number) {
    super(`${label}: no answer within ${ms} ms`);
    this.name = "TimeLimitError";
  }
}

/**
 * `promise`, or a `TimeLimitError` after `ms`. The work itself is not stopped (a stalled D1 call keeps running in its
 * own request), but the caller can answer at once. The timer is cleared as soon as the promise settles.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeLimitError(label, ms)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}
