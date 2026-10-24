import { expect, startFreshAccount, test } from "./helpers";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/**
 * The installed web app (issue 70, phase 1): long-press shortcuts in the manifest, an install offer in the account menu
 * (one tap where the browser offers it, the Help steps on an iPhone) and a badge on the icon while a timer runs. The
 * badge and the install prompt are browser features a test cannot see on a real home screen, so they are recorded.
 */
test("the installed app: shortcuts, an install offer and a badge while the timer runs", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __badge: string[]; __prompted: number };
    w.__badge = [];
    w.__prompted = 0;
    // The built app is installable, so desktop Chrome may fire its own install prompt at any moment; only the test's counts.
    window.addEventListener("beforeinstallprompt", (e) => e.isTrusted && e.stopImmediatePropagation(), true);
    Object.assign(navigator, {
      setAppBadge: async () => void w.__badge.push("set"),
      clearAppBadge: async () => void w.__badge.push("clear"),
    });
  });
  await startFreshAccount(page, "Acme");
  const badge = () => page.evaluate(() => (window as unknown as { __badge: string[] }).__badge.at(-1) ?? "none");
  const menu = page.getByRole("button", { name: /Account menu for/ });

  await test.step("the manifest offers Log time, This week, This month and Invoices on a long press", async () => {
    const res = await page.request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const m = (await res.json()) as { shortcuts: { name: string; url: string }[] };
    expect(m.shortcuts.map((s) => [s.name, s.url])).toEqual([
      ["Log time", "/dashboard/today"],
      ["This week", "/dashboard/week"],
      ["This month", "/dashboard/month"],
      ["Invoices", "/dashboard/invoices"],
    ]);
    const week = await page.request.get(m.shortcuts[1].url);
    expect(week.ok()).toBe(true); // a shortcut opens a real page
  });

  await test.step("a running timer puts a badge on the icon; stopping it clears the badge", async () => {
    const watch = page.getByRole("region", { name: "Timer" });
    await expect.poll(badge).toBe("clear"); // no timer yet
    await watch.getByRole("button", { name: /Start\s+timer/ }).click();
    await expect(watch.getByRole("button", { name: /Stop\s+timer/ })).toBeVisible();
    await expect.poll(badge).toBe("set");
    await page.waitForTimeout(1100); // past the press lock
    await watch.getByRole("button", { name: /Stop\s+timer/ }).click();
    await expect(watch.getByRole("group", { name: /Saved time/ })).toBeVisible();
    await expect.poll(badge).toBe("clear");
  });

  await test.step("no install offer where the browser gives none", async () => {
    await menu.click();
    await expect(page.getByRole("menuitem", { name: "Help" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Install the app|Add to Home Screen/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  await test.step("when the browser offers an install, the menu installs in one tap and then stops offering it", async () => {
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(e, {
        prompt: async () => {
          (window as unknown as { __prompted: number }).__prompted++;
        },
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      window.dispatchEvent(e);
    });
    await menu.click();
    await page.getByRole("menuitem", { name: "Install the app" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
    await menu.click();
    await expect(page.getByRole("menuitem", { name: "Install the app" })).toHaveCount(0); // a prompt works once
    await page.keyboard.press("Escape");
  });

  await test.step("an iPhone (no install prompt) gets Add to Home Screen, which opens the steps in Help", async () => {
    await page.addInitScript((ua) => {
      Object.defineProperty(Navigator.prototype, "userAgent", { get: () => ua });
    }, IPHONE);
    await page.reload();
    await menu.click();
    await page.getByRole("menuitem", { name: "Add to Home Screen" }).click();
    await expect(page).toHaveURL(/\/help\?a=phone/);
    await expect(page.getByText(/tap Share, then Add to Home Screen/).first()).toBeVisible();
  });
});
