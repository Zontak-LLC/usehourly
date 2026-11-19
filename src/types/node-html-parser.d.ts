// Next.js ships its own copy of node-html-parser without types. scripts/landing-static-headers.mjs reads the
// prerendered landing page with it; src/__tests__/landing-csp.test.ts imports it by path so a Next.js upgrade that drops it fails CI.
declare module "next/dist/compiled/node-html-parser" {
  interface HtmlNode {
    querySelectorAll(selector: string): HtmlNode[];
  }
  export function parse(html: string): HtmlNode;
}
