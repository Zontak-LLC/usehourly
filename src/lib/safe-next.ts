const hasControlCharacter = (s: string) => [...s].some((c) => c.charCodeAt(0) < 32);

/** Where to go after signing in: only a path on this site, never another address. */
export function safeNext(value: string | null | undefined, fallback = "/dashboard/today"): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (hasControlCharacter(value)) return fallback;
  return value;
}
