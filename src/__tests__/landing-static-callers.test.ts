import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

// Without scripts/landing-static.mjs a build ships no index.html, and the Worker then serves `/` with no CSP at all
// (the proxy no longer runs there). So every caller of `opennextjs-cloudflare build` must run it, before shipping.
const read = (path: string) => readFileSync(join(__dirname, "../..", path), "utf8");
const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

/** Where each step starts in `text`, in order, or -1 when a step is missing or out of order. */
function orderOf(text: string, steps: readonly string[]): number[] {
  let from = 0;
  return steps.map((step) => {
    const at = text.indexOf(step, from);
    from = at === -1 ? text.length : at + step.length;
    return at;
  });
}

describe("every build that ships runs the landing-page step between build and ship", () => {
  it("npm run landing:static runs scripts/landing-static.mjs", () => {
    expect(pkg.scripts["landing:static"]).toContain("scripts/landing-static.mjs");
  });

  for (const name of ["deploy", "preview"]) {
    it(`npm run ${name}`, () => {
      const steps = ["opennextjs-cloudflare build", "npm run landing:static", `opennextjs-cloudflare ${name}`];
      expect(pkg.scripts[name].split(" && ")).toEqual(steps);
    });
  }

  it("scripts/staging-deploy.mjs, with the build's env and before the leak check and deploy", () => {
    const steps = [
      'run("npx", ["opennextjs-cloudflare", "build", "--config", CONFIG], env)',
      'run("npm", ["run", "landing:static"], env)',
      "const leaked = []",
      'run("npx", ["opennextjs-cloudflare", "deploy", "--config", CONFIG], env)',
    ];
    expect(orderOf(read("scripts/staging-deploy.mjs"), steps)).not.toContain(-1);
  });
});
