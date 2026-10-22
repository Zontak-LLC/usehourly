import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { mkdirSync, writeFileSync } from "node:fs";

/**
 * Not part of a normal run. Looks for text that is hard to read in light or dark, on the main
 * screens (the "stiling" bugs that appear when a colour or a shared component changes):
 *   THEME_AUDIT=1 npx playwright test e2e/theme-audit.spec.ts --project=desktop
 * (add THEME_AUDIT_NAV=left to audit the side menu layout)
 * It signs in with the sample-data demo, loads each page, switches the mode on the page itself, and
 * runs axe's colour-contrast rule. Findings are written to e2e/report/theme-audit.json and summarised in the output.
 */
test.skip(!process.env.THEME_AUDIT, "only when reviewing colours");
test.setTimeout(20 * 60_000);

const PAGES = [
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

type Finding = {
  page: string;
  mode: string;
  ratio: number;
  need: number;
  fg: string;
  bg: string;
  text: string;
  html: string;
};

test("text stays readable in light and dark", async ({ page }) => {
  mkdirSync("e2e/report", { recursive: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  // THEME_AUDIT_NAV=left audits the layout with the navigation down the left (the app's default); otherwise the tab strip along the top.
  const nav = process.env.THEME_AUDIT_NAV === "left" ? "left" : "top"; // left is now the app's default: say which
  await page.context().addCookies([{ name: "nav_position", value: nav, url: new URL("/", page.url()).href }]);

  const findings: Finding[] = [];
  for (const url of PAGES) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    // Colours animate when the theme changes; measuring mid-animation gives false alarms and can hide real problems.
    await page.addStyleTag({
      content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
    });
    for (const mode of ["light", "dark"] as const) {
      await page.evaluate((m) => {
        document.documentElement.classList.toggle("dark", m === "dark");
      }, mode);
      const result = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      for (const v of result.violations) {
        for (const node of v.nodes) {
          const d = (node.any[0]?.data ?? {}) as {
            contrastRatio?: number;
            expectedContrastRatio?: string;
            fgColor?: string;
            bgColor?: string;
          };
          findings.push({
            page: url,
            mode,
            ratio: Number(d.contrastRatio ?? 0),
            need: Number.parseFloat(d.expectedContrastRatio ?? "4.5"),
            fg: d.fgColor ?? "",
            bg: d.bgColor ?? "",
            text: (node.html.match(/>([^<]{1,50})</)?.[1] ?? "").trim(),
            html: node.html.replace(/\s+/g, " ").slice(0, 160),
          });
        }
      }
    }
  }
  writeFileSync("e2e/report/theme-audit.json", JSON.stringify(findings, null, 1));
  console.log(`theme audit: ${findings.length} low-contrast findings across ${PAGES.length} pages x 2 modes`);
});
