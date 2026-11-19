import { createElement } from "react";

import { renderToStaticMarkup } from "react-dom/server";

import { LANDING_JSON_LD } from "@/lib/landing-json-ld";
import { ThemeBootScript } from "@/scripts/theme-boot";

import { createHash } from "node:crypto";

// A landing page like the build's, shared by landing-csp.test.ts and landing-static.test.ts. A test file importing it
// must mock "next/font/google" (the font loader only runs inside a Next.js build).

const OPEN = "<script>";
const CLOSE = "</script>";

/** The real theme boot script tag, as the layout renders it. */
export const themeTag = renderToStaticMarkup(createElement(ThemeBootScript, {}));
/** The theme boot script's text, without its tags. */
export const THEME = themeTag.slice(OPEN.length, -CLOSE.length);
/** The landing page's JSON-LD text. */
export const JSON_LD = JSON.stringify(LANDING_JSON_LD);
/** One Next.js flight script, with an HTML-looking string inside. */
export const FLIGHT = 'self.__next_f.push([1,"0:[\\"$\\",\\"div\\",null,{\\"children\\":\\"<b>hi</b>\\"}]\\n"])';
/** The options of a production build. */
export const STRICT = { isProd: true, upgradeToHttps: true, isStaging: false };

/** The `'sha256-…'` CSP source of a script text. */
export const sha = (body: string) => `'sha256-${createHash("sha256").update(body).digest("base64")}'`;

/** A landing page: the theme boot script, the JSON-LD, one flight script, one external script and a comment. */
export const landingPage = (origin = "https://usehourly.app", flight = FLIGHT) =>
  `<!DOCTYPE html><html><head><link rel="canonical" href="${origin}"/><meta property="og:url" content="${origin}/"/>` +
  `${themeTag}<script src="/_next/static/chunks/main.js" async=""></script></head>` +
  `<body><!-- <script>not a script</script> --><script type="application/ld+json">${JSON_LD}</script>` +
  `<script>${flight}</script></body></html>`;

/** The line for `key` in a `_headers` text, or "". */
export const headerLine = (headers: string, key: string) =>
  headers.split("\n").find((line) => line.trimStart().startsWith(`${key}: `)) ?? "";

/** The Content-Security-Policy value in a `_headers` text, or "". */
export const policyOf = (headers: string) =>
  headerLine(headers, "Content-Security-Policy").replace(/^\s*Content-Security-Policy: /, "");
