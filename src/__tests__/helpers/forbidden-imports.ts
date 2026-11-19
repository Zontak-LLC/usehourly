/** A static import, a bare import or a re-export, with `type` when it is type-only, and its module path. */
const STATEMENT = /^\s*(import|export)\s+(type\s+)?([^;'"]*?\sfrom\s*)?["']([^"']+)["']/gm;

const isForbidden = (module: string) => module === "zod" || module.startsWith("zod/") || module.startsWith("@/server/");

/**
 * The modules a source file imports (or re-exports from) that would bring zod or server code into the browser: zod
 * itself and any `@/server/...` path, in the order they appear. `import type` is fine (it leaves no code behind).
 * Dynamic `import()` is not checked: it loads on use, never with the page.
 */
export function findForbiddenImports(source: string): string[] {
  const found: string[] = [];
  for (const [, keyword, typeOnly, from, module] of source.matchAll(STATEMENT)) {
    if (keyword === "export" && !from) continue; // `export const x = "..."`, not a re-export
    if (!typeOnly && isForbidden(module)) found.push(module);
  }
  return found;
}
