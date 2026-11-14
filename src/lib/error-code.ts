/**
 * The `code` a thrown value carries (Prisma's "P2025" no row, "P2002" duplicate), or undefined. Reads it safely from an
 * Error or a plain object: the D1 adapter does not always throw a real Error.
 */
export function errorCode(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const code = (e as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
