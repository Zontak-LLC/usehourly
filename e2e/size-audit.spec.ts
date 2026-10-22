import { expect, test } from "@playwright/test";

import { mkdirSync, writeFileSync } from "node:fs";

/**
 * Not part of a normal run. Finds the size problems that colour checks cannot: text smaller than 12px, and controls
 * too small to tap. Run it on both projects, since the phone layout changes sizes:
 *   SIZE_AUDIT=1 npx playwright test e2e/size-audit.spec.ts
 * Findings go to e2e/report/size-audit-<project>.json. Thresholds: text under 12px (common guidance: body about
 * 16px, secondary 12 to 14px); controls under 24px fail WCAG 2.5.8, and under 44px (Apple) or 48px (Material) are
 * "small" on a phone. Links inside a sentence, visually hidden text and checkbox/radio inputs tapped through
 * their label are exempt, the same way the page audit treats them.
 */
test.skip(!process.env.SIZE_AUDIT, "only when reviewing sizes");
test.setTimeout(10 * 60_000);

const PUBLIC = ["/", "/auth/v2/login", "/auth/v2/register", "/privacy", "/terms"];
const APP = [
  "/dashboard/today",
  "/dashboard/week",
  "/dashboard/month",
  "/dashboard/invoices",
  "/dashboard/invoices/new",
  "/dashboard/clients",
  "/dashboard/report",
  "/dashboard/account",
  "/dashboard/account#invoices",
  "/dashboard/account#data",
  "/dashboard/account#ai",
];

type Found = { kind: "small-text" | "small-target"; page: string; size: string; text: string; html: string };

async function scan(page: import("@playwright/test").Page, url: string): Promise<Found[]> {
  return page.evaluate((u) => {
    const out: { kind: "small-text" | "small-target"; page: string; size: string; text: string; html: string }[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.visibility !== "hidden" &&
        s.display !== "none" &&
        Number(s.opacity) > 0 &&
        !el.closest("[aria-hidden='true'], [hidden], nextjs-portal, .sr-only")
      );
    };
    const snippet = (el: Element) => el.outerHTML.replace(/\s+/g, " ").slice(0, 120);

    // 1. Text under 12px: any visible element that owns a text node.
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el)) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0);
      if (!own) continue;
      const size = Number.parseFloat(getComputedStyle(el).fontSize);
      if (size < 12) {
        out.push({
          kind: "small-text",
          page: u,
          size: `${size}px`,
          text: (el.textContent ?? "").trim().slice(0, 40),
          html: snippet(el),
        });
      }
    }

    // 2. Controls too small to tap.
    for (const el of document.querySelectorAll(
      "button, a[href], [role='button'], [role='tab'], [role='radio'], select, input:not([type='hidden'])",
    )) {
      if (!visible(el)) continue;
      let r = el.getBoundingClientRect();
      const wrap =
        el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? el.closest("label") : null;
      if (wrap) r = wrap.getBoundingClientRect();
      const sentence =
        el instanceof HTMLAnchorElement &&
        el.parentElement?.matches("p, li") &&
        (el.parentElement.textContent ?? "").length > (el.textContent ?? "").length + 15;
      if (sentence || r.width <= 2 || r.height <= 2) continue;
      const small = Math.min(r.width, r.height);
      if (small < 44) {
        const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40);
        out.push({
          kind: "small-target",
          page: u,
          size: `${Math.round(r.width)}x${Math.round(r.height)}`,
          text: name,
          html: snippet(el),
        });
      }
    }
    return out;
  }, url);
}

test("text and tap targets are big enough", async ({ page }, info) => {
  mkdirSync("e2e/report", { recursive: true });
  const found: Found[] = [];
  for (const url of PUBLIC) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    found.push(...(await scan(page, url)));
  }
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  for (const url of APP) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    found.push(...(await scan(page, url)));
  }
  writeFileSync(`e2e/report/size-audit-${info.project.name}.json`, JSON.stringify(found, null, 1));
  console.log(
    `size audit (${info.project.name}): ${found.filter((f) => f.kind === "small-text").length} small-text, ${found.filter((f) => f.kind === "small-target").length} small-target findings`,
  );
});
