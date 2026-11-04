// Ships the landing page `/` as a static file: Cloudflare serves a file in Workers static assets before the Worker
// runs, so a first visit never waits for a cold start (issue 424). Runs right after `opennextjs-cloudflare build`
// (npm run deploy, npm run preview, scripts/staging-deploy.mjs) and reads that same build's `.next` output; it never
// builds anything itself.
//
// It writes into .open-next/assets:
//  - index.html: the prerendered landing page (src/app/(landing));
//  - _headers: the page's CSP, which allows its inline scripts by hash (no nonce: a static file cannot have one), plus
//    the security headers next.config.mjs sets on every other page.
// It refuses a page whose canonical or og:url origin is not NEXT_PUBLIC_APP_URL, so a page from another build (staging
// vs production) cannot ship.
//
//   npm run landing:static   (node --experimental-strip-types: it reuses buildCsp from src/lib/csp.ts; CI runs Node 22.14)

import { buildCsp } from "../src/lib/csp.ts";
import { securityHeaders } from "../src/lib/security-headers.mjs";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Cloudflare reads at most 2,000 characters per `_headers` line.
const MAX_HEADER_LINE = 2000;
const JS_TYPES = new Set(["", "module", "text/javascript", "application/javascript"]);

// The page is read with the small tokenizer below, not with regular expressions: a regex cannot follow the HTML rules
// (an end tag may be `</script >` or `</SCRIPT/>`, a `>` may sit inside a quoted attribute), and CodeQL rightly flags
// one (js/bad-tag-filter). There is no HTML parser among the dependencies, and the page is our own build's output.
const isSpace = (char) => char === " " || char === "\n" || char === "\t" || char === "\r" || char === "\f";
const endsName = (char) => isSpace(char) || char === "/" || char === ">";
const isLetter = (char) => (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");

/** Reads the attributes of the start tag whose name ends at `from`. Returns them (names lower-cased) and where the tag ends. */
function readAttributes(html, from) {
  const attrs = Object.create(null);
  let at = from;
  const readUntil = (stop) => {
    const start = at;
    while (at < html.length && !stop(html[at])) at++;
    return html.slice(start, at);
  };
  while (at < html.length) {
    readUntil((char) => !isSpace(char) && char !== "/");
    if (at >= html.length || html[at] === ">") break;
    const name = readUntil((char) => isSpace(char) || char === "=" || char === "/" || char === ">").toLowerCase();
    readUntil((char) => !isSpace(char));
    let value = "";
    if (html[at] === "=") {
      at++;
      readUntil((char) => !isSpace(char));
      const quote = html[at];
      if (quote === '"' || quote === "'") {
        at++;
        value = readUntil((char) => char === quote);
        at++;
      } else value = readUntil((char) => isSpace(char) || char === ">");
    }
    if (!(name in attrs)) attrs[name] = value;
  }
  return { attrs, end: Math.min(at + 1, html.length) };
}

/** Where the next `</script` end tag starts (any case, then a space, `/` or `>`), or -1. */
function scriptEndAt(lower, from) {
  for (let at = lower.indexOf("</script", from); at !== -1; at = lower.indexOf("</script", at + 1)) {
    if (endsName(lower[at + "</script".length])) return at;
  }
  return -1;
}

/** Every start tag in the page, in order: its name, its attributes and, for a script, its text. Comments are skipped. */
function startTags(html) {
  const lower = html.toLowerCase();
  const tags = [];
  let at = lower.indexOf("<");
  while (at !== -1) {
    if (lower.startsWith("<!--", at)) {
      const close = lower.indexOf("-->", at + 4);
      at = close === -1 ? -1 : lower.indexOf("<", close + 3);
      continue;
    }
    let nameEnd = at + 1;
    while (nameEnd < lower.length && !endsName(lower[nameEnd])) nameEnd++;
    const name = lower.slice(at + 1, nameEnd);
    if (!isLetter(name[0])) {
      at = lower.indexOf("<", at + 1); // an end tag, a doctype or a stray "<"
      continue;
    }
    const { attrs, end } = readAttributes(html, nameEnd);
    let next = end;
    let text = "";
    if (name === "script") {
      const close = scriptEndAt(lower, end);
      if (close === -1) throw new Error("The landing page has a <script> with no end tag.");
      text = html.slice(end, close);
      next = close + 1;
    }
    tags.push({ name, attrs, text });
    at = lower.indexOf("<", next);
  }
  return tags;
}

/** The `'sha256-…'` source of every inline script in the page that runs (JSON data blocks such as JSON-LD do not). */
export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const { name, attrs, text } of startTags(html)) {
    if (name !== "script" || "src" in attrs) continue;
    if (!JS_TYPES.has((attrs.type ?? "").trim().toLowerCase())) continue;
    hashes.add(`'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`);
  }
  return [...hashes];
}

/** The page's canonical and og:url addresses. */
function pageUrls(html) {
  const urls = [];
  for (const { name, attrs } of startTags(html)) {
    if (name === "link" && attrs.rel?.toLowerCase() === "canonical") urls.push(attrs.href);
    if (name === "meta" && attrs.property === "og:url") urls.push(attrs.content);
  }
  return urls.filter(Boolean);
}

/** Throws unless the page was built for `appUrl` (its canonical and og:url share that origin). */
export function assertBuiltFor(html, appUrl) {
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is not set: cannot tell which site this landing page is for.");
  const origin = new URL(appUrl).origin;
  const urls = pageUrls(html);
  if (urls.length === 0) throw new Error("The landing page has no canonical or og:url link to check its origin.");
  const wrong = urls.find((u) => new URL(u).origin !== origin);
  if (wrong) throw new Error(`The landing page was built for ${new URL(wrong).origin}, not ${origin}.`);
}

/** The `_headers` file for `/`: the CSP with the page's script hashes, then the shared security headers. */
export function landingHeaders(html, appEnv) {
  const csp = buildCsp(inlineScriptHashes(html), true);
  const lines = [
    "# Made by scripts/landing-static.mjs on every build. The landing page is a static file served without the Worker,",
    "# so the CSP and security headers the Worker sets elsewhere are written here.",
    "/",
    `  Content-Security-Policy: ${csp}`,
    ...securityHeaders(appEnv).map(({ key, value }) => `  ${key}: ${value}`),
  ];
  const tooLong = lines.find((line) => line.length > MAX_HEADER_LINE);
  if (tooLong) throw new Error(`A _headers line is over ${MAX_HEADER_LINE} characters: ${tooLong.slice(0, 80)}…`);
  return `${lines.join("\n")}\n`;
}

/** Copies the prerendered landing page into the static assets and writes its `_headers`. */
export function writeLandingAssets({ distDir, assetsDir, appUrl, appEnv }) {
  const page = join(distDir, "server", "app", "index.html");
  if (!existsSync(page)) throw new Error(`No prerendered landing page at ${page}: is / still static?`);
  if (!existsSync(assetsDir)) throw new Error(`No ${assetsDir}: run opennextjs-cloudflare build first.`);
  const html = readFileSync(page, "utf8");
  assertBuiltFor(html, appUrl);
  const headers = landingHeaders(html, appEnv);
  copyFileSync(page, join(assetsDir, "index.html"));
  writeFileSync(join(assetsDir, "_headers"), headers);
  return { scripts: inlineScriptHashes(html).length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { scripts } = writeLandingAssets({
      distDir: process.env.NEXT_DIST_DIR || ".next",
      assetsDir: join(".open-next", "assets"),
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      appEnv: process.env.NEXT_PUBLIC_APP_ENV,
    });
    console.log(`Landing page copied to .open-next/assets/index.html; _headers allows its ${scripts} inline scripts.`);
  } catch (err) {
    console.error(`Landing page not shipped: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
