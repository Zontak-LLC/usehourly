import AxeBuilder from "@axe-core/playwright";
import { type Browser, type BrowserContext, test as base, expect, type Page, type TestInfo } from "@playwright/test";

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

export const PASSWORD = "E2e-Test-Password-2026";
export const MAIL = process.env.E2E_MAIL_URL ?? "http://127.0.0.1:8899";

export const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** A throwaway account. Every address starts with "e2e-" so teardown can find and delete them all. */
export const newUser = () => ({ name: "Sam Freelancer", email: `e2e-${stamp()}@example.test`, password: PASSWORD });
export const clientEmail = () => `e2e-client-${stamp()}@example.test`;
/** The first VISIBLE element showing exactly this text (the same time often also appears in hidden menus). */
export const seen = (scope: Page, text: string) =>
  scope.getByText(text, { exact: true }).locator("visible=true").first();
export const today = () => new Date().toISOString().slice(0, 10);

/** Run SQL against the local database (only for setup a user cannot do, like making an account a few days old). */
export function sql(statement: string) {
  execFileSync("npx", ["wrangler", "d1", "execute", "hourly-db", "--local", "--command", statement], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
}

export type Mail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  reply_to?: string;
  headers?: Record<string, string>;
};

export const clearMail = () => fetch(`${MAIL}/__emails`, { method: "DELETE" });

/** The newest message to `address` (optionally with a subject matching `subject`), waiting a few seconds for it. */
export async function mailTo(address: string, subject?: RegExp): Promise<Mail> {
  for (let i = 0; i < 30; i++) {
    const all = (await (await fetch(`${MAIL}/__emails`)).json()) as Mail[];
    const hit = [...all].reverse().find((m) => m.to === address && (!subject || subject.test(m.subject)));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${address}${subject ? ` matching ${subject}` : ""} arrived.`);
}

/** The first link in a message that contains `part`, e.g. "/verify-email?token=". */
export function linkIn(text: string, part: string): string {
  const m = new RegExp(`https?://[^\\s"'<>]*${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\s"'<>]*`).exec(text);
  if (!m) throw new Error(`No link containing ${part} in the message.`);
  return m[0];
}

/** A browser session with no cookies, shaped like the project's device (desktop or phone): a client opening a link. */
export async function anonymous(browser: Browser, info: TestInfo): Promise<BrowserContext> {
  const u = info.project.use;
  return browser.newContext({
    baseURL: u.baseURL,
    viewport: u.viewport,
    userAgent: u.userAgent,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
    deviceScaleFactor: u.deviceScaleFactor,
  });
}

/**
 * Checks every page should pass, whatever it is for. These are the things found by eye in a first-day walkthrough:
 * a button with no name (an icon a screen reader cannot read), a form that would put its fields in the address bar,
 * a page that scrolls sideways, and (on a phone) controls too small to tap.
 */
export async function auditPage(page: Page, label: string, isPhone: boolean) {
  const { problems, advice } = await page.evaluate((phone) => {
    const out: string[] = [];
    const tips: string[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.visibility !== "hidden" &&
        s.display !== "none" &&
        !el.closest("[aria-hidden='true'], [hidden], nextjs-portal")
      );
    };
    const nameOf = (el: Element): string => {
      const aria = el.getAttribute("aria-label")?.trim();
      if (aria) return aria;
      const by = el.getAttribute("aria-labelledby");
      if (by) {
        const t = by
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
        if (t) return t;
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        const labels = el.labels
          ? [...el.labels]
              .map((l) => l.textContent ?? "")
              .join(" ")
              .trim()
          : "";
        if (labels) return labels;
        if (el instanceof HTMLInputElement && (el.type === "submit" || el.type === "button")) return el.value.trim();
        return el.getAttribute("title")?.trim() ?? "";
      }
      const own = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      return own || (el.getAttribute("title")?.trim() ?? "");
    };
    const snippet = (el: Element) => el.outerHTML.replace(/\s+/g, " ").slice(0, 110);

    for (const el of document.querySelectorAll(
      "button, a[href], [role='button'], input:not([type='hidden']), select, textarea",
    )) {
      if (!visible(el)) continue;
      const name = nameOf(el);
      if (!name) out.push(`no accessible name: ${snippet(el)}`);
      if (phone) {
        let r = el.getBoundingClientRect();
        // A checkbox or radio inside a label is tapped through the label; a 1px control is visually hidden on purpose.
        const wrap =
          el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")
            ? el.closest("label")
            : null;
        if (wrap) r = wrap.getBoundingClientRect();
        if (r.width > 2 && r.height > 2 && (r.width < 24 || r.height < 24)) {
          tips.push(
            `small tap target ${Math.round(r.width)}x${Math.round(r.height)}px (24px is the minimum): ${name || snippet(el)}`,
          );
        }
      }
    }
    for (const f of document.querySelectorAll("form")) {
      if ((f.getAttribute("method") ?? "get").toLowerCase() !== "post")
        out.push(`form without method=post: ${snippet(f)}`);
    }
    for (const i of document.querySelectorAll("img:not([alt])")) out.push(`image without alt text: ${snippet(i)}`);
    const wide = document.documentElement.scrollWidth;
    if (wide > window.innerWidth + 1)
      out.push(`scrolls sideways: the page is ${wide}px wide in a ${window.innerWidth}px window`);
    if (!document.title.trim()) out.push("page has no title");
    const h1s = document.querySelectorAll("h1").length;
    if (h1s !== 1) out.push(`${h1s} top-level headings (expected exactly 1)`);
    return { problems: out, advice: tips };
  }, isPhone);
  // Advice does not fail a run; it is kept with the report so a review (or the site-test skill) can read it.
  for (const tip of advice) test.info().annotations.push({ type: `advice: ${label}`, description: tip });
  expect.soft(problems, `page checks: ${label}`).toEqual([]);
}

/** Console messages that are noise in development, not problems with the app. */
// 400/401/403 are the app saying no on purpose (a wrong password, a refused send); 5xx and uncaught errors still fail.
const IGNORED = [/favicon/i, /Download the React DevTools/i, /status of 40[013]/i, /\[Fast Refresh\]/i];

type Fixtures = {
  /** Save a full-page screenshot, numbered, under e2e/report/screens/<device>/. */
  shot: (name: string) => Promise<void>;
  /** Run the standard checks on the current page. */
  audit: (label: string) => Promise<void>;
  /** Run the accessibility scanner (axe); only "critical" findings fail, the rest are attached to the report. */
  a11y: (label: string) => Promise<void>;
  isPhone: boolean;
};

export const test = base.extend<Fixtures>({
  isPhone: async ({}, use, testInfo) => use(testInfo.project.name === "phone"),
  page: async ({ page }, use) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`uncaught error: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !IGNORED.some((r) => r.test(m.text())))
        problems.push(`console error: ${m.text().slice(0, 3500)}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 500) problems.push(`HTTP ${r.status()}: ${r.url()}`);
    });
    await use(page);
    expect.soft(problems, "errors in the browser").toEqual([]);
  },
  shot: async ({ page }, use, testInfo) => {
    let n = 0;
    const slug = testInfo.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    await use(async (name) => {
      n++;
      const dir = `e2e/report/screens/${testInfo.project.name}`;
      mkdirSync(dir, { recursive: true });
      // caret: "initial" because hiding carets (the default) edits input styles and can cause a false hydration warning.
      await page.screenshot({
        path: `${dir}/${slug}-${String(n).padStart(2, "0")}-${name}.png`,
        fullPage: true,
        caret: "initial",
      });
    });
  },
  audit: async ({ page, isPhone }, use) => use((label) => auditPage(page, label, isPhone)),
  a11y: async ({ page }, use, testInfo) =>
    use(async (label) => {
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const summary = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        count: v.nodes.length,
      }));
      await testInfo.attach(`a11y-${label}`, {
        body: JSON.stringify(summary, null, 2),
        contentType: "application/json",
      });
      expect
        .soft(
          results.violations.filter((v) => v.impact === "critical").map((v) => `${v.id}: ${v.help}`),
          `critical accessibility problems: ${label}`,
        )
        .toEqual([]);
    }),
});

export { expect };
