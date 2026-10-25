import { expect, test } from "@playwright/test";

import { startDemo } from "./helpers";
import { mkdirSync, readFileSync } from "node:fs";

/**
 * Not part of a normal run. Step 1 of issue 324 (picture first): photographs Today, Week and Invoices in the proposed
 * Night look, with docs/mockups/night-theme.css pasted into the page by hand, plus a sketch of the Account "Appearance"
 * card. The app itself does not know Night yet.
 *   NIGHT_MOCKUP=1 npx playwright test e2e/night-mockup.spec.ts --project=desktop   (and --project=phone)
 * Pictures go to docs/mockups/night-theme/<screen>-<mode>-<desktop|phone>.png: Dark (before) and Night (after) side by side.
 */
test.skip(!process.env.NIGHT_MOCKUP, "only when making the Night mockup");

const OUT = "docs/mockups/night-theme";
const NIGHT_CSS = readFileSync("docs/mockups/night-theme.css", "utf8");

const SCREENS: [name: string, url: string][] = [
  ["today", "/dashboard/today"],
  ["week", "/dashboard/week"],
  ["invoices", "/dashboard/invoices"],
];

test("photograph the Night mockup", async ({ page }, info) => {
  mkdirSync(OUT, { recursive: true });
  await startDemo(page);
  for (const [name, url] of SCREENS) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({
      content: `${NIGHT_CSS}\n*, *::before, *::after { transition: none !important; animation: none !important; }`,
    });
    for (const mode of ["dark", "night"] as const) {
      await page.evaluate((m) => {
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
        document.documentElement.setAttribute("data-theme-mode", m);
      }, mode);
      await page.screenshot({
        path: `${OUT}/${name}-${mode}-${info.project.name}.png`,
        fullPage: true,
        caret: "initial",
      });
    }
  }

  // A sketch of the Appearance card (Account > Your account). Drawn by hand: step 2 builds it with ToggleGroup.
  await page.goto("/dashboard/account#account");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: NIGHT_CSS });
  await page.evaluate(() => {
    const root = document.documentElement;
    root.classList.add("dark");
    root.style.colorScheme = "dark";
    root.setAttribute("data-theme-mode", "night");
    const card = document.createElement("section");
    card.id = "night-mockup-card";
    card.setAttribute(
      "style",
      "margin:16px;max-width:480px;padding:16px;border:1px solid var(--border);border-radius:calc(var(--radius) + 4px);background:var(--card);color:var(--card-foreground);font-family:var(--font-sans)",
    );
    const items = ["Light", "Dark", "Night"]
      .map(
        (label) =>
          `<span style="padding:6px 14px;border-radius:calc(var(--radius) - 2px);${
            label === "Night"
              ? "background:var(--accent);color:var(--foreground);font-weight:600"
              : "color:var(--muted-foreground)"
          }">${label}</span>`,
      )
      .join("");
    card.innerHTML = `<h2 style="font-size:16px;font-weight:600;margin:0 0 4px">Appearance</h2><p style="margin:0 0 12px;font-size:14px;color:var(--muted-foreground)">How UseHourly looks on your screens.</p><div style="display:inline-flex;gap:2px;padding:2px;border:1px solid var(--input);border-radius:var(--radius);background:var(--background)">${items}</div>`;
    (document.querySelector("main") ?? document.body).insertAdjacentElement("afterbegin", card);
  });
  await page.locator("#night-mockup-card").screenshot({ path: `${OUT}/appearance-card-${info.project.name}.png` });
});
