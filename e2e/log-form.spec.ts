import { minutesHint, TYPED_NOT_POSITIVE } from "../src/lib/typed-duration";
import { expect, startFreshAccount, test } from "./helpers";

// One Log time form everywhere (2026-10-23 redesign): the time first, Log time beside it on a wide screen and under the
// quick times on a phone (2026-10-25), "on" and the project pills, then the description. Week's day panel is the same form.
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

  await test.step("time first; Log time beside it on a wide screen, under the quick times on a phone", async () => {
    await expect(time).toBeVisible();
    if (phone) {
      expect(await top(log)).toBeGreaterThan(await top(page.getByRole("button", { name: "1 hour", exact: true })));
      expect(await top(log)).toBeLessThan(await top(description));
    } else expect(Math.abs((await top(log)) - (await top(time)))).toBeLessThan(8);
    await expect(page.getByText("on", { exact: true }).first()).toBeVisible(); // "on" Acme · General
    expect(await top(page.getByText("on", { exact: true }).first())).toBeGreaterThan(await top(time));
  });

  await test.step("after a save the button says what went in, and its name stays Log time", async () => {
    await expect(help).toBeVisible();
    await page.getByRole("button", { name: "1 hour", exact: true }).click();
    await log.click();
    // The button's own words; the saved-time line under it ("Logged 1:00 on General · Acme") says it too.
    await expect(log.getByText("Logged 1:00")).toBeVisible();
    await expect(log).toHaveCount(1);
    await time.fill("30m"); // typing a new time ends the moment at once
    await expect(page.getByText(/^Logged 1:00/)).toHaveCount(0);
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

/**
 * The time box says what it will log, so nobody logs two minutes when they meant two hours (issue 435): a bare number is
 * hours, "1,5" works like "1.5", and a value it cannot log gets plain words (never the raw zod "Too small") that the
 * next keystroke clears. Nothing is sent while it shows them.
 */
test("the time box previews = 2:00, reads 1,5, and refuses 0 and 25 in plain words without sending them", async ({
  page,
}) => {
  await startFreshAccount(page, "Acme");
  const card = page.getByRole("region", { name: /^Log time/ });
  const time = card.getByLabel("Time to add");
  const log = card.getByRole("button", { name: /^Log time/ });
  const days = page.getByRole("navigation", { name: "Days" });
  const creates: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("entry.create")) creates.push(request.url());
  });

  await test.step("a bare 2 shows = 2:00 before saving and logs two hours", async () => {
    await time.fill("2");
    await expect(card.getByText("= 2:00 · Day total 0:00 → 2:00 h")).toBeVisible();
    await expect(time).toHaveAttribute("aria-invalid", "false");
    await log.click();
    await expect(days).toContainText("2:00 this day");
  });

  await test.step("1,5 shows = 1:30 and logs 1:30", async () => {
    await time.fill("1,5");
    await expect(card.getByText(/^= 1:30 · Day total 2:00 → 3:30 h$/)).toBeVisible();
    await log.click();
    await expect(days).toContainText("3:30 this day");
  });

  await test.step("0 asks for more than 0, sends nothing, and the next key clears it", async () => {
    const sent = creates.length;
    const error = card.getByText(TYPED_NOT_POSITIVE, { exact: true });
    await time.fill("0");
    await expect(error).toBeVisible();
    await expect(time).toHaveAttribute("aria-invalid", "true");
    await expect(log).toBeDisabled();
    await time.press("Enter"); // the form's own submit: refused in the browser
    await expect(time).toBeFocused();
    await expect(page.getByText(/Too small/)).toHaveCount(0);
    expect(creates).toHaveLength(sent);
    await time.press("1"); // "01" is one hour
    await expect(card.getByText(/^= 1:00 · /)).toBeVisible();
    await expect(error).toHaveCount(0);
    await expect(days).toContainText("3:30 this day");
  });

  await test.step("a bare 25 is not logged; 25m logs twenty-five minutes", async () => {
    const sent = creates.length;
    await time.fill("25");
    await expect(card.getByText(minutesHint(25), { exact: true })).toBeVisible();
    await time.press("Enter");
    expect(creates).toHaveLength(sent);
    await expect(days).toContainText("3:30 this day");
    await time.fill("25m");
    await expect(card.getByText(minutesHint(25))).toHaveCount(0);
    await expect(card.getByText(/^= 0:25 · /)).toBeVisible();
    await log.click();
    await expect(days).toContainText("3:55 this day");
  });
});
