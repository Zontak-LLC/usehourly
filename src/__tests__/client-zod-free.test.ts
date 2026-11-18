import { describe, expect, it } from "vitest";

import { findForbiddenImports } from "./helpers/forbidden-imports";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * No zod in the browser (issue 425): zod is about 30 KB gz, and tree-shaking does not drop it, so one schema left in a
 * file the pages import puts it back into every page. These src/lib files are on the pages' import paths (the tRPC
 * provider's local-sync chain, sign-out in the header menu, Today's calendar, the export and share panels), so they may
 * not import zod, nor a value from src/server (where the request schemas live). `npm run measure:routes` checks the
 * real build; this test catches the slip before a build.
 */
const LIB = join(process.cwd(), "src", "lib");
const CLIENT_FILES = [
  "dates.ts",
  "offline-queue.ts",
  "rounding.ts",
  "invoice-schedule.ts",
  "support-notice.ts",
  "timesheet-share.ts",
  "calendar-store.ts",
  "google-calendar.ts",
  "sign-out.ts",
  "export-csv.ts",
  ...readdirSync(join(LIB, "local-sync"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => `local-sync/${f}`),
];

describe("findForbiddenImports", () => {
  it("reports a zod import and a value import from src/server", () => {
    expect(findForbiddenImports('import { z } from "zod";')).toEqual(["zod"]);
    expect(findForbiddenImports('import { x } from "@/server/date-schema";')).toEqual(["@/server/date-schema"]);
  });

  it("ignores an import type from src/server", () => {
    expect(findForbiddenImports('import type { X } from "@/server/date-schema";')).toEqual([]);
  });

  it("reads imports over several lines, re-exports and bare imports, and skips plain exports", () => {
    const source = [
      "import {",
      "  a,",
      "  b,",
      '} from "zod";',
      'export { c } from "@/server/schemas/dates";',
      'import "zod/v4";',
      'export const label = "zod";',
      'import { ok } from "@/lib/dates";',
    ].join("\n");
    expect(findForbiddenImports(source)).toEqual(["zod", "@/server/schemas/dates", "zod/v4"]);
  });
});

describe("the src/lib files the pages import", () => {
  it("covers the local-sync folder too", () => {
    expect(CLIENT_FILES).toEqual(expect.arrayContaining(["local-sync/link.ts", "local-sync/engine.ts"]));
  });

  it.each(CLIENT_FILES)("%s imports no zod and no server code", (file) => {
    expect(findForbiddenImports(readFileSync(join(LIB, file), "utf8"))).toEqual([]);
  });
});
