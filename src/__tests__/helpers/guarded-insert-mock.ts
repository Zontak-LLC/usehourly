import { Prisma } from "@prisma/client";
import { vi } from "vitest";

/**
 * Lets a hand-written Prisma mock take the guarded insert of server/quota-insert.ts
 * (`INSERT INTO t (cols) SELECT ?, ... WHERE (SELECT COUNT(*) FROM t WHERE ...) < ?`). `$executeRaw` reads the
 * statement back: the room comes from the mock's own `count` (each COUNT's WHERE becomes a `where`), the row goes to the
 * mock's own `create`, and `findUniqueOrThrow` by id hands back what `create` returned. So a test keeps its rows and its
 * checks on `count` and `create`. A mock cannot prove the insert is atomic: quota-race-journey.test.ts does, on real
 * Prisma over SQLite.
 */

const MODELS = { clients: "client", projects: "project", time_entries: "timeEntry", api_tokens: "apiToken" } as const;
type Model = {
  count?: (a: { where: Record<string, unknown> }) => Promise<number>;
  create?: (a: { data: Record<string, unknown> }) => Promise<unknown>;
  findUniqueOrThrow?: unknown;
};

/** Splits on `sep` outside parentheses. */
function splitTop(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (depth === 0 && text.startsWith(sep, i)) {
      parts.push(text.slice(start, i));
      start = i + sep.length;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim());
}

/** "(x)" -> "x" when the outer parentheses belong together. */
function unwrap(text: string): string {
  const inner = text.slice(1, -1);
  return text.startsWith("(") && text.endsWith(")") && balanced(inner) ? inner : text;
}
function balanced(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    depth += ch === "(" ? 1 : ch === ")" ? -1 : 0;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function parseWhere(text: string, take: () => unknown): Record<string, unknown> {
  const or = splitTop(text, " OR ");
  if (or.length > 1) return { OR: or.map((p) => parseWhere(unwrap(p), take)) };
  const where: Record<string, unknown> = {};
  for (const term of splitTop(text, " AND ")) {
    const inner = unwrap(term);
    if (inner !== term) {
      Object.assign(where, parseWhere(inner, take));
      continue;
    }
    const eq = /^(\w+) = \?$/.exec(term);
    const isNull = /^(\w+) IS NULL$/.exec(term);
    if (eq) where[eq[1]] = take();
    else if (isNull) where[isNull[1]] = null;
    else throw new Error(`guarded-insert mock cannot read "${term}"`);
  }
  return where;
}

const wrapped = new WeakSet<object>();

/** Adds `$executeRaw` and each model's `findUniqueOrThrow` to `prisma` (once; wrapping again changes nothing). */
export function withGuardedInsert<P extends object>(prisma: P): P {
  if (wrapped.has(prisma)) return prisma;
  wrapped.add(prisma);
  const db = prisma as unknown as Record<string, Model>;
  const made = new Map<string, unknown>();
  const $executeRaw = vi.fn(async (strings: readonly string[], ...args: unknown[]) => {
    const query = Prisma.sql(strings, ...(args as Prisma.Sql[]));
    const head = /^INSERT INTO (\w+) \(([^)]+)\) SELECT [?,\s]+ WHERE (.*) < \?$/.exec(query.sql);
    if (!head) throw new Error(`guarded-insert mock cannot read ${query.sql}`);
    const [, table, cols, used] = head;
    const columns = cols.split(",").map((c) => c.trim());
    const values = [...query.values];
    const data = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
    let next = columns.length;
    const take = () => values[next++];
    let room = 0;
    for (const [i, part] of splitTop(used, " - ").entries()) {
      const count = /^SELECT COUNT\(\*\) FROM (\w+) WHERE (.*)$/.exec(unwrap(part));
      if (!count) throw new Error(`guarded-insert mock cannot read ${part}`);
      const model = db[MODELS[count[1] as keyof typeof MODELS]];
      const n = (await model?.count?.({ where: parseWhere(count[2], take) })) ?? 0;
      room += i === 0 ? n : -n;
    }
    const limit = take() as number;
    if (room >= limit) return 0;
    delete data.created_at;
    delete data.updated_at;
    const model = db[MODELS[table as keyof typeof MODELS]];
    const row = (await model?.create?.({ data })) ?? data;
    made.set(String(data.id), row);
    return 1;
  });
  for (const name of Object.values(MODELS)) {
    const model = db[name];
    if (model && !model.findUniqueOrThrow) {
      model.findUniqueOrThrow = vi.fn(async ({ where }: { where: { id: string } }) => {
        if (!made.has(where.id)) throw new Error(`No ${name} ${where.id}`);
        return made.get(where.id);
      });
    }
  }
  Object.assign(prisma, { $executeRaw });
  return prisma;
}
