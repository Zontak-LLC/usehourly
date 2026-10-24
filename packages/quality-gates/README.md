# quality-gates

The checks a linter cannot express, one gate command, and the hooks that run it before a commit, before a push, in
CI and when an AI assistant ends a turn.

## Why

UseHourly once shipped an "Edit day" button that did nothing. A rewrite left it unwired, every check was green, and
no test ever clicked it. The lesson: a rule that is only remembered will be forgotten. So every rule here is checked
by a command, the same command runs everywhere, and a rule can only ever get stricter.

This is slice 1 of [issue 126](https://github.com/Zontak-LLC/usehourly/issues/126). UseHourly runs on it. It is not
published yet (the npm name `quality-gates` is reserved).

## Install and set up

```bash
npm install --save-dev quality-gates
npx quality-gates init           # dry run: says what it would write
npx quality-gates init --write   # writes it
```

`init` writes `.githooks/pre-commit` and `pre-push`, a `prepare` script (switches the hooks on) and a `ci` script,
the Claude Code `Stop` hook in `.claude/settings.json`, `.github/workflows/ci.yml` and a starter
`quality-gates.config.mjs`. It never overwrites a file; it adds to `package.json` and `.claude/settings.json`.

## The one gate command

`npm run ci` runs everything, and CI, the pre-push hook and you all run that same command:

```bash
quality-gates rules && biome check && tsc --noEmit && vitest run --coverage
```

## Config

`quality-gates.config.mjs` at the project root:

```js
export default {
  files: { include: ["src", "e2e"], extensions: ["ts", "tsx", "mjs"] },
  rules: {
    "no-double-cast": { only: ["src/**"] },          // options: only, skip (path globs), message
    "no-raw-header": { header: "cf-connecting-ip" },  // off until it has a header
    "no-eval": false,                                 // off
  },
  custom: [{ message: "use the Notice component", pattern: /bg-muted\/40 p-/, only: ["src/**"] }],
  colours: { include: ["src"], baseline: "colour-baseline.json", exclude: ["src/lib/palette.ts"] },
};
```

A line is exempt when it, or the line above it, says why: `// check-rules-ok: <reason>`, or a Biome suppression with
its reason. A marker with no reason exempts nothing and is reported itself.

## Rules

| Rule | Finds |
| --- | --- |
| `no-ts-ignore` | `@ts-ignore` and `@ts-nocheck` (use `@ts-expect-error` with a reason) |
| `no-double-cast` | `as unknown as` (skips tests) |
| `todo-needs-issue` | TODO, FIXME or HACK without an issue number, e.g. `TODO(#41)` |
| `no-raw-header` | a header read directly instead of through one helper (set `header`) |
| `no-only` | `.only(` and an unconditional `.skip("...")` in test files |
| `no-inner-html` | `dangerouslySetInnerHTML` |
| `no-eval` | `eval(` and `new Function(` |
| `custom` | your own `{ message, pattern }` rules |

**Colour ratchet** (`quality-gates colours`, optional): the number of hard-coded hex colours per file may only go
down. `colours --write` records lower counts and refuses higher ones. Exempt a line with `// colour-ok: <reason>`.

## Presets to extend

- Biome: `"extends": ["quality-gates/biome.json"]` (strict lint rules, no `any`, no `!`, no stray `console`,
  cognitive complexity 30).
- TypeScript: `"extends": "quality-gates/tsconfig.strict.json"`.
- jscpd: `jscpd --config node_modules/quality-gates/jscpd.json src` (at most 1% duplication).
- vitest: `coverage: coverageFloor({ thresholds: { statements, branches, functions, lines } })` from
  `quality-gates/vitest`.

## Structure tests

```ts
import { checkLayers, checkProcedureContract, listFiles } from "quality-gates";

const files = listFiles({ include: ["src"], extensions: ["ts", "tsx"], exclude: ["**/__tests__/**"] });
expect(checkLayers({ files, rules: [{ name: "lib is pure", from: ["src/lib/**"], banned: /^@\/server\// }] })).toEqual([]);

const r = await checkProcedureContract({ router, caller: createCaller({ session: null }), publicProcedures: ["auth.login"] });
expect([r.openToSignedOut, r.mutationsWithoutInput, r.unknownPublic]).toEqual([[], [], []]);
```

`checkLayers` names each file and import that crosses a line (type-only imports are fine); a rule can also forbid text
(`pattern`) or apply only to files whose text matches (`when: /"use client"/`). `checkProcedureContract` calls every
tRPC procedure signed out and lists the ones not refused, and every mutation without an input schema.
