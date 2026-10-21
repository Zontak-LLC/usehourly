import AxeBuilder from "@axe-core/playwright";
import {
  type Browser,
  type BrowserContext,
  test as base,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

export const PASSWORD = "E2e-Test-Password-2026";
export const MAIL = process.env.E2E_MAIL_URL ?? "http://127.0.0.1:8899";

/**
 * Runs one of an entry card's rarer actions (Move to another day, Delete) from its "More actions" menu; Edit is a visible button. `scope` is the card (or the page, for its first card).
 * The menu opens in a layer of its own, so the item is looked up on the page.
 */
export async function entryAction(scope: Page | Locator, action: "Move to another day" | "Delete") {
  const page = await openEntryMenu(scope);
  await page.getByRole("menuitem", { name: action }).click();
}

/** Opens an entry card's "More actions" menu and returns the page, so its items can be checked. */
export async function openEntryMenu(scope: Page | Locator): Promise<Page> {
  const page = "context" in scope ? scope : scope.page();
  const button = scope.getByRole("button", { name: "More actions" }).first();
  // A card the server has not confirmed yet is replaced when it is; a menu opened before that would close under us.
  await expect(button.locator("xpath=ancestor::li[1]")).not.toHaveAttribute("aria-busy", "true");
  await button.click();
  return page;
}

export const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** A throwaway account. Every address starts with "e2e-" so teardown can find and delete them all. */
export const newUser = () => ({ name: "Sam Freelancer", email: `e2e-${stamp()}@example.test`, password: PASSWORD });
/** Signs a new account up through the real pages and answers the first-run question, ending on Today with the add form ready. */
export async function startFreshAccount(page: Page, clientName = "Offline Co") {
  const user = newUser();
  await page.goto("/auth/v2/register");
  await page.getByLabel("Name", { exact: true }).fill(user.name);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/dashboard\/today/);
  await page.getByPlaceholder(/company or a person/i).fill(clientName);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Time to add")).toBeVisible();
  return user;
}

export const clientEmail = () => `e2e-client-${stamp()}@example.test`;
/** The first VISIBLE element showing exactly this text (the same time often also appears in hidden menus). */
export const seen = (scope: Page, text: string) =>
  scope.getByText(text, { exact: true }).locator("visible=true").first();
export const today = () => new Date().toISOString().slice(0, 10);

/** Run SQL against the local database (only for setup a user cannot do, like making an account a few days old). */
export function sql(statement: string) {
  const persist = process.env.E2E_PERSIST ? ["--persist-to", process.env.E2E_PERSIST] : [];
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", statement], {
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
        // A link in the middle of a sentence is exempt (WCAG 2.5.8): skip it when its paragraph has more text than the link.
        const sentence =
          el instanceof HTMLAnchorElement &&
          el.parentElement?.matches("p, li") &&
          (el.parentElement.textContent ?? "").length > (el.textContent ?? "").length + 15;
        if (!sentence && r.width > 2 && r.height > 2 && (r.width < 24 || r.height < 24)) {
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
    // A card (bordered, rounded box) may sit on the page or inside one card, never inside a card inside a card.
    // Buttons, fields, tabs and links are not cards, and dialogs render outside the page so they start again.
    const notCards = new Set(["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A", "OPTION", "LABEL", "SUMMARY"]);
    const isCard = (el: Element) => {
      const role = el.getAttribute("role");
      if (notCards.has(el.tagName) || (role && ["tab", "radio", "button"].includes(role))) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        Number.parseFloat(s.borderTopWidth) > 0 &&
        Number.parseFloat(s.borderTopLeftRadius) >= 8 &&
        r.width > 120 &&
        r.height > 36
      );
    };
    const cards = [...document.body.querySelectorAll("*")].filter(isCard);
    const cardSet = new Set(cards);
    for (const card of cards) {
      let depth = 1;
      for (let p = card.parentElement; p; p = p.parentElement) if (cardSet.has(p)) depth++;
      if (depth > 2) out.push(`card nested ${depth} deep (max 2): ${snippet(card)}`);
    }
    // Every card on a page has a tinted header band, like its neighbours (docs/ui-spec.md "Surfaces"). A card that has a
    // heading but no band is the loose-cards kind of inconsistency; a deliberate exception says so with data-headerless.
    const body = document.querySelector("h1")?.closest("div.mx-auto")?.children[1];
    for (const el of body ? [...body.children] : []) {
      if (!cardSet.has(el) || el.hasAttribute("data-headerless") || !el.querySelector("h2, h3")) continue;
      const head = el.firstElementChild;
      const bandColour = head ? getComputedStyle(head).backgroundColor : "";
      const cardColour = getComputedStyle(el).backgroundColor;
      if (!head || bandColour === "rgba(0, 0, 0, 0)" || bandColour === cardColour) {
        out.push(
          `a card with a heading but no tinted header band (add one, or data-headerless with a reason): ${snippet(el)}`,
        );
      }
    }
    // One solid (primary) button per screen: it is the one main action. Dialogs are closed when a page is checked.
    const solid = [...document.querySelectorAll('[data-variant="primary"]')].filter(
      (b) => (b as HTMLElement).offsetParent,
    );
    if (solid.length > 1)
      out.push(`${solid.length} solid buttons (expected at most 1): ${solid.map(snippet).join(" | ")}`);
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
// These net:: errors are what the browser logs when a test switches it offline or aborts a request on purpose.
const IGNORED = [
  /net::ERR_(INTERNET_DISCONNECTED|CONNECTION_FAILED|FAILED)/i,
  /Failed to fetch RSC payload/i, // Next logs this when a page change falls back to a normal page load while offline
  /favicon/i,
  /Download the React DevTools/i,
  /status of 40[013]/i,
  /\[Fast Refresh\]/i,
];

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
  // The app starts with the navigation down the left on a wide screen; most journeys were written against the tab strip
  // along the top, so they start with that saved choice. `left-nav.spec.ts` removes it to test the real default.
  context: async ({ context, baseURL }, use) => {
    if (baseURL) await context.addCookies([{ name: "nav_position", value: "top", url: baseURL }]);
    await use(context);
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires the destructuring pattern even when no fixture is used
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

/** Opens a ··· menu by its button's name (for example "More actions for Acme Studio") and picks one item. */
export async function menuAction(page: Page, button: string, item: string) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
}
