import { describe, expect, it } from "vitest";

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A form that has no method submits with GET if its script has not loaded yet (a slow phone, a blocked script): every
 * field, a password or a client's name included, would land in the address bar, the browser history, server logs and
 * the next page's referrer. Found in a first-day walkthrough on 2026-10-17 (a password showed up in the URL).
 * So every form must say `method="post"`, which at worst sends nothing anywhere useful instead of leaking.
 */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".tsx") ? [path] : [];
  });

describe("forms", () => {
  it('every <form> in the app declares method="post"', () => {
    const bad: string[] = [];
    for (const file of walk("src")) {
      for (const tag of readFileSync(file, "utf8").matchAll(/<form\b[^>]*>/g)) {
        if (!/\bmethod=("post"|\{"post"\})/i.test(tag[0])) bad.push(`${file}: ${tag[0].slice(0, 70)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("finds at least the forms we know about, so this test cannot pass by looking at nothing", () => {
    const count = walk("src").reduce((n, f) => n + (readFileSync(f, "utf8").match(/<form\b/g)?.length ?? 0), 0);
    expect(count).toBeGreaterThan(15);
  });
});
