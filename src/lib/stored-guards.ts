/**
 * Small checks for data this browser saved itself (localStorage). They replaced zod schemas in `offline-queue.ts` and
 * `calendar-store.ts` (issue 425): those files load with every dashboard page, and zod cost about 30 KB gz there. Each
 * check accepts exactly what the zod rule did: `z.object` (a non-array object), `z.string().min().max()` (length in
 * UTF-16 units), `z.number()` (finite), `.int()`.
 */
export type Fields = Record<string, unknown>;

/** A plain object (not null, not an array), like `z.object`. */
export const isFields = (v: unknown): v is Fields => typeof v === "object" && v !== null && !Array.isArray(v);

/** A string whose length is within `min` and `max`, like `z.string().min(min).max(max)`. */
export const isText = (v: unknown, min = 0, max = Number.POSITIVE_INFINITY): v is string =>
  typeof v === "string" && v.length >= min && v.length <= max;

/** A finite number, like `z.number()`. */
export const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A whole number within `min` and `max`, like `z.number().int().min(min).max(max)`. */
export const isWholeIn = (v: unknown, min: number, max: number): v is number =>
  Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;

/** An array of at most `max` items, like `z.array(...).max(max)`. */
export const isListUpTo = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;
