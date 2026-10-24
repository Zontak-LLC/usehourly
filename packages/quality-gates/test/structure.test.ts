import { initTRPC, TRPCError } from "@trpc/server";
import { checkLayers, checkProcedureContract, importsOf, listFiles } from "quality-gates";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { cleanFixtures, fixture } from "./fixture";

afterAll(cleanFixtures);

describe("layering rules on a small app", () => {
  const app = fixture({
    "src/lib/pure.ts": 'import { a } from "./other";\nexport const p = a;\n',
    "src/lib/leaky.ts": 'import { db } from "@/server/db";\nexport { thing } from "@/server/thing";\n',
    "src/lib/typed.ts": 'import type { Db } from "@/server/db";\nexport type T = Db;\n',
    "src/lib/auth.ts": 'import { db } from "@/server/db";\n',
    "src/components/button.tsx": '"use client";\nimport { db } from "@/server/db";\n',
    "src/components/server-only.tsx": 'import { db } from "@/server/db";\n',
    "src/server/client.ts": "export const c = new Client();\n",
    "src/server/db.ts": "export const db = new Client();\n",
  });
  const files = listFiles({ cwd: app.dir, include: ["src"], extensions: ["ts", "tsx"] });

  it("names each file and the import that crosses a line (type-only imports are fine)", () => {
    const found = checkLayers({
      cwd: app.dir,
      files,
      rules: [{ name: "lib is pure", from: ["src/lib/**"], except: ["src/lib/auth.ts"], banned: /^@\/server\// }],
    });
    expect(found.map((v) => v.message)).toEqual([
      "src/lib/leaky.ts imports @/server/db",
      "src/lib/leaky.ts imports @/server/thing",
    ]);
  });

  it("checks only files whose text matches `when`", () => {
    const found = checkLayers({
      cwd: app.dir,
      files,
      rules: [{ name: "browser code", from: /^src\/components\//, when: /"use client"/, banned: /^@\/server\// }],
    });
    expect(found).toEqual([
      {
        rule: "browser code",
        file: "src/components/button.tsx",
        found: "@/server/db",
        message: "src/components/button.tsx imports @/server/db",
      },
    ]);
  });

  it("finds forbidden text outside the one file allowed to have it", () => {
    const found = checkLayers({
      cwd: app.dir,
      files,
      rules: [{ name: "one client", from: /^src\//, except: /^src\/server\/db\.ts$/, pattern: /new Client\(/ }],
    });
    expect(found.map((v) => v.file)).toEqual(["src/server/client.ts"]);
  });

  it("refuses a rule that checks nothing", () => {
    expect(() => checkLayers({ cwd: app.dir, files, rules: [{ name: "empty", from: /./ }] })).toThrow(
      /needs banned or pattern/,
    );
  });

  it("reads runtime imports and re-exports only", () => {
    expect(importsOf('import a from "a";\nimport type B from "b";\nexport * from "c";\nconst x = "from d";')).toEqual([
      "a",
      "c",
    ]);
  });
});

describe("the procedure contract on a small tRPC app", () => {
  const t = initTRPC.context<{ userId: string | null }>().create();
  const signedIn = t.procedure.use(({ ctx, next }) => {
    if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
    return next();
  });
  const router = t.router({
    notes: t.router({
      list: signedIn.query(() => []),
      add: signedIn.input(z.object({ text: z.string() })).mutation(() => 1),
      clear: signedIn.mutation(() => 0),
      wipe: signedIn.mutation(() => 0),
    }),
    health: t.procedure.query(() => "ok"),
    leak: t.procedure.query(() => "everyone's notes"),
  });
  const caller = t.createCallerFactory(router)({ userId: null });

  it("finds the procedure open to a signed-out caller, the mutation with no input, and a stale public name", async () => {
    const result = await checkProcedureContract({
      router,
      caller,
      publicProcedures: ["health", "notes.gone"],
      noInputMutations: ["notes.clear"],
    });
    expect(result).toEqual({
      names: ["notes.list", "notes.add", "notes.clear", "notes.wipe", "health", "leak"],
      openToSignedOut: ["leak -> undefined"],
      mutationsWithoutInput: ["notes.wipe"],
      unknownPublic: ["notes.gone"],
    });
  });

  it("passes once every procedure is refused or deliberately public", async () => {
    const result = await checkProcedureContract({
      router,
      caller,
      publicProcedures: ["health", "leak"],
      noInputMutations: ["notes.clear", "notes.wipe"],
    });
    expect([result.openToSignedOut, result.mutationsWithoutInput, result.unknownPublic]).toEqual([[], [], []]);
  });
});
