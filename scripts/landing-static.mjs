// Ships the landing page `/` as a static file: Cloudflare serves a file in Workers static assets before the Worker
// runs, so a first visit never waits for a cold start. Runs right after `opennextjs-cloudflare build` (npm run deploy,
// npm run preview, scripts/staging-deploy.mjs) and reads that same build's `.next` output; it never builds anything.
//
// It writes into .open-next/assets:
//  - index.html: the prerendered landing page (src/app/(landing));
//  - _headers: a `/` rule with the page's CSP, which allows its inline scripts by hash (no nonce: a static file cannot
//    have one), plus the security headers next.config.mjs sets on every other page. Rules already there are kept.
//    The rule itself is built in scripts/landing-static-headers.mjs.
// Then it reads both files back and refuses to ship a page whose scripts the browser would block.
// It refuses a page whose canonical or og:url origin is not NEXT_PUBLIC_APP_URL, so a page from another build (staging
// vs production) cannot ship.
//
//   npm run landing:static

import {
  assertBuiltFor,
  inlineScriptHashes,
  landingHeaders,
  landingPolicy,
  RULE_MARK,
} from "./landing-static-headers.mjs";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Throws unless the shipped `_headers` allows every inline script of the shipped page, and scripts never inline. */
export function checkLandingAssets(assetsDir) {
  const html = readFileSync(join(assetsDir, "index.html"), "utf8");
  const policy = landingPolicy(readFileSync(join(assetsDir, "_headers"), "utf8"));
  const scriptSrc = policy.split(";").find((part) => part.trim().startsWith("script-src ")) ?? "";
  if (!scriptSrc) throw new Error("The _headers file has no Content-Security-Policy with a script-src for /.");
  if (scriptSrc.includes("'unsafe-inline'")) throw new Error("The landing page's script-src has 'unsafe-inline'.");
  const allowed = new Set(scriptSrc.trim().split(/\s+/));
  const missing = inlineScriptHashes(html).find((hash) => !allowed.has(hash));
  if (missing) throw new Error(`An inline script on the landing page is not allowed by _headers: ${missing}.`);
}

/** Copies the prerendered landing page into the static assets, adds its `_headers` rule, then checks both. */
function writeLandingAssets({ distDir, assetsDir, appUrl, isStaging }) {
  const page = join(distDir, "server", "app", "index.html");
  if (!existsSync(page)) throw new Error(`No prerendered landing page at ${page}: is / still static?`);
  if (!existsSync(assetsDir)) throw new Error(`No ${assetsDir}: run opennextjs-cloudflare build first.`);
  const html = readFileSync(page, "utf8");
  assertBuiltFor(html, appUrl);
  const headersFile = join(assetsDir, "_headers");
  const existing = existsSync(headersFile) ? readFileSync(headersFile, "utf8") : "";
  if (existing.includes(RULE_MARK))
    throw new Error(`${headersFile} already has the / rule: rebuild before running again.`);
  const rule = landingHeaders({ html, isProd: true, upgradeToHttps: true, isStaging });
  copyFileSync(page, join(assetsDir, "index.html"));
  writeFileSync(headersFile, existing ? `${existing.trimEnd()}\n\n${rule}` : rule);
  checkLandingAssets(assetsDir);
  return { scripts: inlineScriptHashes(html).length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { scripts } = writeLandingAssets({
      distDir: process.env.NEXT_DIST_DIR || ".next",
      assetsDir: join(".open-next", "assets"),
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      isStaging: process.env.NEXT_PUBLIC_APP_ENV === "staging",
    });
    console.log(`Landing page copied to .open-next/assets/index.html; _headers allows its ${scripts} inline scripts.`);
  } catch (err) {
    console.error(`Landing page not shipped: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
