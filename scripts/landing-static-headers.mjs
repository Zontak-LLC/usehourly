// The landing page's `_headers` rule, built from its prerendered HTML: pure functions, no files. Used by the
// post-build step (scripts/landing-static.mjs) and by e2e/public.spec.ts, which serves the real build under this rule.
// No `import.meta` here: Playwright loads this file as CommonJS.

// The HTML parser Next.js ships with itself: no extra dependency, and never a regex on HTML (CodeQL js/bad-tag-filter).
// landing-csp.test.ts imports the same package path, so a Next.js upgrade that drops it fails `npm run ci`.
import * as parserModule from "next/dist/compiled/node-html-parser/index.js";

import { buildCsp, securityHeaders } from "../src/lib/security-policy.mjs";
import { createHash } from "node:crypto";

// It is a bundled CommonJS file: plain Node sees its exports only as `default`; Vitest and Playwright see `parse`.
const { parse } = parserModule.parse ? parserModule : parserModule.default;

// Cloudflare reads at most 2,000 characters per `_headers` line.
const MAX_HEADER_LINE = 2000;
const CSP_KEY = "Content-Security-Policy:";

/** The first line of the `/` rule: how the post-build step tells that a `_headers` file already has it. */
export const RULE_MARK = "# The landing page / (scripts/landing-static.mjs): a static file served without the Worker,";

/** The page as a tree. Script and style text is kept exactly as written, so its hash matches what the browser hashes. */
const parsePage = (html) => parse(html, { comment: false, blockTextElements: { script: true, style: true } });

/** The `'sha256-…'` source of every inline script in the page (each `<script>` with no `src`), in page order. */
export function inlineScriptHashes(html) {
  const hashes = parsePage(html)
    .querySelectorAll("script")
    .filter((script) => !script.hasAttribute("src"))
    .map((script) => `'sha256-${createHash("sha256").update(script.rawText, "utf8").digest("base64")}'`);
  return [...new Set(hashes)];
}

/** Throws unless the page was built for `appUrl` (its canonical and og:url share that origin). */
export function assertBuiltFor(html, appUrl) {
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is not set: cannot tell which site this landing page is for.");
  const origin = new URL(appUrl).origin;
  const page = parsePage(html);
  const urls = [
    page.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    page.querySelector('meta[property="og:url"]')?.getAttribute("content"),
  ].filter(Boolean);
  if (urls.length === 0) throw new Error("The landing page has no canonical or og:url link to check its origin.");
  const wrong = urls.find((url) => new URL(url).origin !== origin);
  if (wrong) throw new Error(`The landing page was built for ${new URL(wrong).origin}, not ${origin}.`);
}

/**
 * The `_headers` rule for `/`: the CSP with the page's script hashes, then the shared security headers.
 * Throws if a line is longer than Cloudflare reads.
 */
export function landingHeaders({ html, isProd, upgradeToHttps, isStaging }) {
  const csp = buildCsp({ scriptSources: inlineScriptHashes(html), isProd, upgradeToHttps });
  const lines = [
    RULE_MARK,
    "# so the CSP and security headers the Worker sets elsewhere are written here.",
    "/",
    `  ${CSP_KEY} ${csp}`,
    ...securityHeaders({ isStaging }).map(({ key, value }) => `  ${key}: ${value}`),
  ];
  const tooLong = lines.find((line) => line.length > MAX_HEADER_LINE);
  if (tooLong) throw new Error(`A _headers line is over ${MAX_HEADER_LINE} characters: ${tooLong.slice(0, 80)}…`);
  return `${lines.join("\n")}\n`;
}

/** The Content-Security-Policy of the `/` rule in a `_headers` text, or "" when there is none. */
export function landingPolicy(headersText) {
  let path = "";
  let policy = "";
  for (const line of headersText.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) path = line.trim();
    else if (path === "/" && line.trim().startsWith(CSP_KEY)) policy = line.trim().slice(CSP_KEY.length).trim();
  }
  return policy;
}
