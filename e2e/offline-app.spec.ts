import { expect, startFreshAccount, test } from "./helpers";

/**
 * The app opens with no connection and shows what it last showed (the service worker keeps the pages, the app keeps a
 * copy of the data), an entry typed offline is saved and sent later, and signing out leaves nothing of the person's
 * on the device.
 */
const LAST_DATA = "hourly:queryCache";

// `next dev` cannot start a page with no connection (its hot-reload socket is cut), so these need a production build:
// build, `opennextjs-cloudflare preview --port 3028`, then run with E2E_BASE_URL=http://localhost:3028 (see CLAUDE.md).
test.skip(!process.env.E2E_BASE_URL, "needs a production build (set E2E_BASE_URL)");

test("the app opens offline with what you last saw, takes an entry, and syncs when the connection returns", async ({
  page,
}) => {
  await startFreshAccount(page);

  // an entry made online, then visit the pages that should work offline
  await page.getByLabel("Time to add").fill("2:00");
  await page.getByLabel("Description").fill("seen while online");
  await page.getByRole("button", { name: /Add to the day/ }).click();
  await expect(page.getByText("seen while online")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto("/dashboard/week");
  await expect(page.getByRole("heading", { name: /weekly timesheet/i })).toBeVisible();
  await page.goto("/dashboard/today");
  await expect(page.getByText("seen while online")).toBeVisible();
  // the app saves its copy a moment after the data changes
  await page.waitForFunction((k) => (localStorage.getItem(k) ?? "").includes("seen while online"), LAST_DATA);

  // no connection: reload the page
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page.getByText("seen while online")).toBeVisible(); // the last data, not an error or a blank screen
  await expect(page.getByLabel("Offline status")).toContainText("You're offline");

  // another page opened before works too; one never opened shows the plain offline page
  await page.getByRole("link", { name: "Week", exact: true }).click();
  await expect(page.getByRole("heading", { name: /weekly timesheet/i })).toBeVisible();
  await expect(page.getByText("seen while online").first()).toBeVisible();
  await page.goto("/dashboard/month");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await page.goto("/dashboard/today");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();

  // an entry typed on the offline page is kept, then sent when the connection returns
  await page.getByLabel("Time to add").fill("30m");
  await page.getByLabel("Description").fill("typed on the offline page");
  await page.getByRole("button", { name: /Add to the day/ }).click();
  await expect(page.getByLabel("Offline status")).toContainText("1 saved on this device");
  await page.context().setOffline(false);
  await expect(page.getByText("1 saved entry synced.")).toBeVisible();
  await expect(page.getByText("typed on the offline page")).toBeVisible();
  await page.reload();
  await expect(page.getByText("typed on the offline page")).toHaveCount(1);
  await expect(page.getByText("seen while online")).toHaveCount(1);
});

test("signing out leaves no kept pages or saved data on the device", async ({ page }) => {
  await startFreshAccount(page);
  await page.getByLabel("Time to add").fill("1h");
  await page.getByLabel("Description").fill("private note");
  await page.getByRole("button", { name: /Add to the day/ }).click();
  await expect(page.getByText("private note")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto("/dashboard/today");
  await page.waitForFunction((k) => (localStorage.getItem(k) ?? "").includes("private note"), LAST_DATA);
  const kept = await page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith("hourly-pages")));
  expect(kept.length).toBeGreaterThan(0); // pages really were kept

  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/auth\/v2\/login/);

  const left = await page.evaluate(
    async (k) => ({
      pages: (await caches.keys()).filter((n) => n.startsWith("hourly-pages")),
      data: localStorage.getItem(k),
      owner: localStorage.getItem("hourly:cacheOwner"),
    }),
    LAST_DATA,
  );
  expect(left).toEqual({ pages: [], data: null, owner: null });
});

test("the whole guide reads with no connection, including pages never opened", async ({ page }) => {
  await startFreshAccount(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto("/dashboard/today");
  // the app fetches every guide page once, a few seconds after it opens
  await page.waitForFunction(() => localStorage.getItem("hourly:guideKept") !== null, undefined, { timeout: 30_000 });

  await page.context().setOffline(true);
  await page.goto("/help/rounding"); // never opened: kept by the once-only fetch
  await expect(page.getByRole("heading", { name: "Rounding time on invoices", level: 1 })).toBeVisible();
  await page.goto("/help");
  await page.getByRole("searchbox", { name: "Search the guide" }).fill("offline");
  await expect(page.getByRole("link", { name: /Working offline/ }).first()).toBeVisible(); // search needs no server
  await page.goto("/help/faq");
  await expect(page.getByRole("heading", { name: "Is UseHourly really free?" })).toBeVisible();
  await page.context().setOffline(false);
});
