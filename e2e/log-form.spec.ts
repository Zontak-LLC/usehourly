import { expect, startFreshAccount, test } from "./helpers";

// One Log time form everywhere (2026-10-23 redesign): the time first, Log time beside it on a wide screen and at the
// foot on a phone, quick times, "on" and the project pills, then the description. Week's day panel is the same form.
test("the Log time form: layout, the Logged moment, the help line fading out, and the same form on Week", async ({
  page,
}, info) => {
  const phone = info.project.name === "phone";
  await startFreshAccount(page, "Acme");
  const time = page.getByLabel("Time to add");
  const log = page.getByRole("button", { name: /^Log time/ });
  const description = page.getByLabel("Description");
  const help = page.getByText("Type a time or tap one (tap again to add more), then add it.");

  const top = async (l: typeof time) => (await l.boundingBox())?.y ?? 0;

  await test.step("time first; Log time beside it on a wide screen, at the foot on a phone", async () => {
    await expect(time).toBeVisible();
    if (phone) expect(await top(log)).toBeGreaterThan(await top(description));
    else expect(Math.abs((await top(log)) - (await top(time)))).toBeLessThan(8);
    await expect(page.getByText("on", { exact: true })).toBeVisible(); // "on" Acme · General
    expect(await top(page.getByText("on", { exact: true }))).toBeGreaterThan(await top(time));
  });

  await test.step("after a save the button says what went in, and its name stays Log time", async () => {
    await expect(help).toBeVisible();
    await page.getByRole("button", { name: "1 hour", exact: true }).click();
    await log.click();
    await expect(page.getByText("Logged 1:00")).toBeVisible();
    await expect(log).toHaveCount(1);
    await time.fill("30m"); // typing a new time ends the moment at once
    await expect(page.getByText("Logged 1:00")).toHaveCount(0);
    await log.click();
  });

  await test.step("the help line shows for the first few entries only", async () => {
    await time.fill("15m");
    await log.click();
    await expect(page.getByRole("navigation", { name: "Days" })).toContainText("1:45 this day");
    await expect(help).toHaveCount(0);
  });

  await test.step("Week's day panel is the same form", async () => {
    await page.goto("/dashboard/week");
    await expect(time).toBeVisible();
    await expect(page.getByText("on", { exact: true })).toBeVisible();
    if (!phone) expect(Math.abs((await top(log)) - (await top(time)))).toBeLessThan(8);
  });
});

test("a refused save takes the Logged moment back and gives the typed time back", async ({ page }) => {
  await startFreshAccount(page);
  await page.route("**/api/trpc/entry.create*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { error: { message: "Refused on purpose.", code: -32600, data: { code: "BAD_REQUEST", httpStatus: 400 } } },
      ]),
    }),
  );
  await page.getByLabel("Time to add").fill("2h");
  await page.getByRole("button", { name: /^Log time/ }).click();
  await expect(page.getByText("Refused on purpose.")).toBeVisible();
  await expect(page.getByText(/^Logged /)).toHaveCount(0);
  await expect(page.getByLabel("Time to add")).toHaveValue("2h");
});
