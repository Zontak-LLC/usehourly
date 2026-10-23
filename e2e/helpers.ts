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
 * Opens an entry card's edit form (its one visible button, "Edit") and returns the card, so the form's fields and its
 * Delete button can be used. `scope` is the card (or the page, for its first card).
 */
export async function openEntryEdit(scope: Page | Locator): Promise<Locator> {
  const page = "context" in scope ? scope : scope.page();
  const button = scope.getByRole("button", { name: "Edit", exact: true }).first();
  // A card the server has not confirmed yet is replaced when it is; a form opened before that would close under us.
  await expect(button.locator("xpath=ancestor::li[1]")).not.toHaveAttribute("aria-busy", "true");
  await button.click();
  // The open card is found by its pressed Edit button: a card filtered by its note stops matching once the note is in a
  // text box (a field's value is not text on the page).
  const card = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Edit", exact: true, expanded: true }) })
    .last();
  await expect(card.getByLabel("Day")).toBeVisible();
  return card;
}

/**
 * Runs one of an entry card's rarer actions, which live in its edit form: Delete (the red button at the foot of the form,
 * which asks to confirm: the caller confirms) or moving it to another day (the form's "Day" field, then Save).
 */
export async function entryAction(scope: Page | Locator, action: "Delete"): Promise<void>;
export async function entryAction(scope: Page | Locator, action: "Move", date: string): Promise<void>;
export async function entryAction(scope: Page | Locator, action: "Delete" | "Move", date?: string) {
  const card = await openEntryEdit(scope);
  if (action === "Delete") {
    await card.getByRole("button", { name: "Delete", exact: true }).click();
    return;
  }
  await card.getByLabel("Day").fill(date ?? "");
  await card.getByRole("button", { name: "Save", exact: true }).click();
}

export const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** A throwaway account. Every address starts with "e2e-" so teardown can find and delete them all. */
export const newUser = () => ({ name: "Sam Freelancer", email: `e2e-${stamp()}@example.test`, password: PASSWORD });
/**
 * A new account, ready for the first-run question, signed in and standing on Today. The account is made and signed in
 * through the same two calls the pages make (the sign-up procedure and the sign-in), not by clicking through the form: a
 * click-through costs about three seconds and 34 test files do it. The real sign-up PAGE is covered once, by the
 * first-day journey (e2e/first-day.spec.ts) and by e2e/public.spec.ts.
 */
export async function signUpByApi(page: Page) {
  const user = newUser();
  const made = await page.request.post("/api/trpc/account.register", {
    data: { name: user.name, email: user.email, password: user.password },
  });
  expect(made.ok(), `sign-up call answered ${made.status()}`).toBe(true);
  const { csrfToken } = (await (await page.request.get("/api/auth/csrf")).json()) as { csrfToken: string };
  const signedIn = await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email: user.email, password: user.password, json: "true" },
  });
  expect(signedIn.ok(), `sign-in call answered ${signedIn.status()}`).toBe(true);
  return user;
}

/** Signs a new account up and answers the first-run question, ending on Today with the add form ready. */
export async function startFreshAccount(page: Page, clientName = "Offline Co") {
  const user = await signUpByApi(page);
  await page.goto("/dashboard/today");
  await expect(page).toHaveURL(/dashboard\/today/);
  await page.getByPlaceholder(/company or a person/i).fill(clientName);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Time to add")).toBeVisible();
  return user;
}

/**
 * Opens the landing page and starts the sample-data demo, ending on the dashboard. The button only works once the page's
 * script has loaded, which on a slow machine (a cold CircleCI container compiling the page) can take a while: a click
 * before that does nothing. So wait for the page to settle, and click again if nothing happened.
 */
export async function startDemo(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const button = page.getByRole("button", { name: /try the demo/i }).first();
  await expect(async () => {
    await button.click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 });
  }).toPass({ timeout: 90_000, intervals: [1000] });
}

/** Adds projects to the signed-in account's first client through the API (the picker shows "More…" from six projects). */
export async function addProjects(page: Page, names: string[]) {
  const listed = await page.request.get("/api/trpc/clients.list");
  expect(listed.ok(), `clients.list answered ${listed.status()}`).toBe(true);
  const clients = ((await listed.json()) as { result: { data: { id: string }[] } }).result.data;
  for (const name of names) {
    const made = await page.request.post("/api/trpc/project.create", {
      data: { clientId: clients[0].id, name, hourlyRate: 5000 },
    });
    expect(made.ok(), `project.create answered ${made.status()}`).toBe(true);
  }
}

export const clientEmail = () => `e2e-client-${stamp()}@example.test`;
/** The first VISIBLE element showing exactly this text (the same time often also appears in hidden menus). */
export const seen = (scope: Page, text: string) =>
  scope.getByText(text, { exact: true }).locator("visible=true").first();
export const today = () => new Date().toISOString().slice(0, 10);

/** Run SQL against the local database (only for setup a user cannot do, like making an account a few days old). */
export function sql(statement: string) {
  const persist = process.env.E2E_PERSIST ? ["--persist-to", process.env.E2E_PERSIST] : [];
  // Several workers share one local database file with the app, so it can be locked for a moment ("database is locked",
  // SQLITE_BUSY). Wait a little and try again instead of failing the test.
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", statement], {
        cwd: process.cwd(),
        stdio: "pipe",
      });
      return;
    } catch (err) {
      const text = `${(err as { stderr?: Buffer }).stderr ?? ""}${(err as Error).message}`;
      if (attempt >= 6 || !/SQLITE_BUSY|database is locked/i.test(text)) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400 * attempt);
    }
  }
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

/** Forgets one address's messages (never everyone's: specs run side by side and share the mailbox). */
export const clearMail = (address: string) =>
  fetch(`${MAIL}/__emails?to=${encodeURIComponent(address)}`, { method: "DELETE" });

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
  // After a client-side navigation a built app sets the new page's title a moment after its content shows; give it
  // that moment, so "page has no title" means the page really has none (still none after it: the check below reports it).
  await page.waitForFunction(() => document.title.trim() !== "", undefined, { timeout: 5_000 }).catch(() => undefined);
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

/**
 * Opens the Clients page on one client's profile (issue 238): the page is a split view, and on a phone the list and
 * the profile are two screens, so the client is picked from the list.
 */
export async function gotoClient(page: Page, name: string) {
  await page.goto("/dashboard/clients");
  await page
    .locator('a[href^="/dashboard/clients/"]')
    .filter({ has: page.getByText(name, { exact: true }) })
    .locator("visible=true")
    .first()
    .click();
  await expect(page.getByRole("region", { name, exact: true }).getByRole("heading", { level: 2 })).toHaveText(name);
}

/** Opens a ··· menu by its button's name (for example "More actions for Acme Studio") and picks one item. */
export async function menuAction(page: Page, button: string, item: string) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

/** Week and Month fold their full list of entries ("What you worked on") behind one button: open it. */
export async function openAllEntries(page: Page) {
  const fold = page.getByRole("button", { name: /^All entries this (week|month)/ });
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await fold.click();
  await expect(page.getByRole("region", { name: "What you worked on" })).toBeVisible();
}
