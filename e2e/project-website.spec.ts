import type { Page } from "@playwright/test";

import { WEBSITE_ERROR } from "../src/lib/web-address";
import { expect, gotoClient, signUpByApi, signUpReady, test, trpc } from "./helpers";

/**
 * A project's website (2026-11-06, migration 0041): on the client's Projects tab the project NAME is the link (a small
 * icon after it, new tab). No website = the plain name, as before. Mockup: docs/design/project-website.html.
 */

const CLIENT = "Shared Co"; // what signUpReady makes, with its project "General"

const heading = (page: Page, name: string) =>
  page.getByRole("heading", { level: 3, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });
const row = (page: Page, name: string) => page.getByRole("listitem").filter({ has: heading(page, name) });
const websiteBox = (page: Page) => page.getByLabel("Website (optional)");

async function editWebsite(page: Page, project: string, typed: string) {
  await page.getByRole("button", { name: `Edit ${project}`, exact: true }).click();
  await websiteBox(page).fill(typed);
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

/** A fresh account with one client and one project made with a website through the API (as project.create takes it). */
async function accountWithProject(page: Page, name: string, website: string | null) {
  await signUpByApi(page);
  const client = await trpc<{ id: string }>(page, "clients.create", { name: CLIENT });
  await trpc(page, "project.create", { clientId: client.id, name, hourlyRate: 0, website });
  await gotoClient(page, CLIENT);
}

test("the project name links to its website once one is saved, and is plain again when it is cleared", async ({
  page,
}) => {
  await signUpReady(page);
  await gotoClient(page, CLIENT);
  // No website yet: the name is plain text.
  await expect(heading(page, "General")).toHaveText("General");
  await expect(heading(page, "General").getByRole("link")).toHaveCount(0);

  await editWebsite(page, "General", "magsmith.com");
  const link = heading(page, "General").getByRole("link", { name: /General/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAccessibleName(/General \(opens in a new tab\)/);
  await expect(link).toHaveAttribute("href", "https://magsmith.com/");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(link).toHaveAttribute("rel", /noreferrer/);
  expect((await link.innerText()).trim()).toBe("General");
  await expect(row(page, "General").getByRole("link", { name: "magsmith.com" })).toHaveCount(0);
  await expect(row(page, "General").getByRole("link")).toHaveCount(1);

  // The saved address fills the box; clearing it and saving makes the name plain again.
  await page.getByRole("button", { name: "Edit General", exact: true }).click();
  await expect(websiteBox(page)).toHaveValue("https://magsmith.com/");
  await websiteBox(page).fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit General", exact: true })).toBeVisible();
  await expect(heading(page, "General").getByRole("link")).toHaveCount(0);
  await expect(heading(page, "General")).toHaveText("General");
});

test("the link underlines on hover and shows a ring when reached with the keyboard", async ({ page, isPhone }) => {
  test.skip(isPhone, "hover and Tab are computer gestures");
  await accountWithProject(page, "Shop", "https://example.org");
  const link = heading(page, "Shop").getByRole("link");
  await link.hover();
  await expect.poll(() => link.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain("underline");
  // Keyboard focus: from the row's pencil, Shift+Tab lands on the link (the only other control in the row).
  await page.mouse.move(0, 0);
  await row(page, "Shop").getByRole("button", { name: "Edit Shop", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(link).toBeFocused();
  const focusStyle = await link.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle, shadow: s.boxShadow };
  });
  expect(focusStyle.outline !== "none" || focusStyle.shadow !== "none", JSON.stringify(focusStyle)).toBe(true);
});

test("a long linked name truncates on a phone and the pencil stays in the row", async ({ page, isPhone }) => {
  test.skip(!isPhone, "the 390 px layout");
  const long = "Website redesign and the new online shop for the spring collection 2027";
  expect(long.length).toBeGreaterThanOrEqual(60);
  await accountWithProject(page, long, "magsmith.com");
  const h3 = heading(page, long);
  await expect(h3.getByRole("link")).toHaveAttribute("href", "https://magsmith.com/");
  expect(await h3.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const line = row(page, long);
  const pencil = line.getByRole("button", { name: `Edit ${long}`, exact: true });
  await expect(pencil).toBeVisible();
  const [rowBox, pencilBox] = [await line.boundingBox(), await pencil.boundingBox()];
  if (!rowBox || !pencilBox) throw new Error("row or pencil has no box");
  expect(pencilBox.x + pencilBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a bad website in the edit form shows the error, sends nothing and keeps the old link", async ({ page }) => {
  await accountWithProject(page, "Shop", "magsmith.com");
  const updates: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("project.update")) updates.push(r.url());
  });
  await editWebsite(page, "Shop", "not a site");
  await expect(page.getByText(WEBSITE_ERROR)).toBeVisible();
  await expect(websiteBox(page)).toHaveValue("not a site"); // the form stays open with what was typed
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(heading(page, "Shop").getByRole("link")).toHaveAttribute("href", "https://magsmith.com/");
  expect(updates).toEqual([]);
});

test("Add a project with a website links its name; a bad website adds nothing", async ({ page }) => {
  await signUpReady(page);
  await gotoClient(page, CLIENT);
  const add = page.getByRole("button", { name: `Add a project for ${CLIENT}` }).first();

  await add.click();
  await page.getByLabel("Project name").fill("Landing page");
  await websiteBox(page).fill("example.org");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(heading(page, "Landing page").getByRole("link")).toHaveAttribute("href", "https://example.org/");

  await add.click();
  await page.getByLabel("Project name").fill("Bad one");
  await websiteBox(page).fill("not a site");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(WEBSITE_ERROR)).toBeVisible();
  await expect(websiteBox(page)).toHaveValue("not a site");
  await expect(heading(page, "Bad one")).toHaveCount(0);
});
