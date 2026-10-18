import { describe, expect, it } from "vitest";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Layering rules, checked from the import lines. A violation names the file and the import.
 *   src/lib      pure rules: must not reach into server code, React components or app routes
 *   src/components, src/app   (browser code): must not import src/server (it holds database access)
 *   src/server/trpc.ts        must not import next-auth or Prisma at runtime (so routers stay testable)
 */
const files = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__"));

const importsOf = (file: string) =>
  [...readFileSync(file, "utf8").matchAll(/^\s*(?:import(?!\s+type\b)|export)\s[^;]*?from\s+["']([^"']+)["']/gm)].map(
    (m) => m[1] as string,
  );

function violations(inDir: RegExp, banned: RegExp, except: RegExp = /^$/): string[] {
  return files
    .filter((f) => inDir.test(f) && !except.test(f))
    .flatMap((f) =>
      importsOf(f)
        .filter((i) => banned.test(i))
        .map((i) => `${f} imports ${i}`),
    );
}

describe("architecture", () => {
  it("src/lib does not import server code, components or routes", () => {
    // auth.ts is where NextAuth is wired to the server; the preferences store calls a server action.
    expect(
      violations(
        /^src\/lib\//,
        /^@\/(server|components|app)\//,
        /^src\/lib\/(auth\.ts|preferences\/preferences-storage\.ts)$/,
      ),
    ).toEqual([]);
  });

  it("browser code does not import src/server (type-only imports of routers are fine)", () => {
    const found = files
      .filter(
        (f) =>
          /^src\/(components|app)\//.test(f) &&
          !/\/(api|\.well-known)\//.test(f) &&
          !/(layout|page|route|proxy)\.tsx?$/.test(f),
      )
      .flatMap((f) => {
        const text = readFileSync(f, "utf8");
        if (!/"use client"/.test(text)) return [];
        return importsOf(f)
          .filter((i) => /^@\/server\//.test(i) && !/import type[^;]*["']@\/server\//.test(text))
          .map((i) => `${f} imports ${i}`);
      });
    expect(found).toEqual([]);
  });

  it("trpc.ts stays free of next-auth and Prisma", () => {
    expect(violations(/^src\/server\/trpc\.ts$/, /^(next-auth|@prisma\/|@\/lib\/(auth|prisma))/)).toEqual([]);
  });

  it("only src/lib/prisma.ts builds a PrismaClient", () => {
    const found = files.filter((f) => f !== "src/lib/prisma.ts" && /new PrismaClient\(/.test(readFileSync(f, "utf8")));
    expect(found).toEqual([]);
  });
});
