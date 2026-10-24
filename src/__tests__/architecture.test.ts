import { checkLayers, listFiles } from "quality-gates";
import { describe, expect, it } from "vitest";

/**
 * Layering rules, checked from the import lines (packages/quality-gates `checkLayers`). A violation names the file and
 * the import.
 *   src/lib      pure rules: must not reach into server code, React components or app routes
 *   src/components, src/app   (browser code): must not import src/server (it holds database access)
 *   src/server/trpc.ts        must not import next-auth or Prisma at runtime (so routers stay testable)
 */
const files = listFiles({ include: ["src"], extensions: ["ts", "tsx"], exclude: ["**/__tests__/**"] });
const found = (rule: Parameters<typeof checkLayers>[0]["rules"][number]) =>
  checkLayers({ files, rules: [rule] }).map((v) => v.message);

describe("architecture", () => {
  it("src/lib does not import server code, components or routes", () => {
    // auth.ts is where NextAuth is wired to the server; the preferences store calls a server action.
    expect(
      found({
        name: "lib is pure",
        from: /^src\/lib\//,
        except: /^src\/lib\/(auth\.ts|preferences\/preferences-storage\.ts)$/,
        banned: /^@\/(server|components|app)\//,
      }),
    ).toEqual([]);
  });

  it("browser code does not import src/server (type-only imports of routers are fine)", () => {
    expect(
      found({
        name: "browser code has no database access",
        from: /^src\/(components|app)\//,
        except: /\/(api|\.well-known)\/|(layout|page|route|proxy)\.tsx?$/,
        when: /"use client"/,
        banned: /^@\/server\//,
      }),
    ).toEqual([]);
  });

  it("trpc.ts stays free of next-auth and Prisma", () => {
    expect(
      found({
        name: "routers stay testable",
        from: /^src\/server\/trpc\.ts$/,
        banned: /^(next-auth|@prisma\/|@\/lib\/(auth|prisma))/,
      }),
    ).toEqual([]);
  });

  it("only src/lib/prisma.ts builds a PrismaClient", () => {
    expect(
      found({
        name: "one PrismaClient",
        from: /^src\//,
        except: /^src\/lib\/prisma\.ts$/,
        pattern: /new PrismaClient\(/,
      }),
    ).toEqual([]);
  });
});
