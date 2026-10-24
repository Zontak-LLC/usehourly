import { FEATURES } from "../src/lib/features";
import { icsFor } from "./calendar-fixture";
import { expect, startFreshAccount, test } from "./helpers";

/*
 * "Never lose a day" (issue 99): meeting rules on Today's calendar suggestions, and the one calm line about the last
 * working day with no time. Desktop and phone.
 */

test("a project picked by hand for a meeting becomes a one-tap rule, used for the next meeting and kept on reload", async ({
  page,
}) => {
  test.skip(!FEATURES.calendar, "The calendar import is hidden in this release (src/lib/features.ts)");
  await startFreshAccount(page);
  const card = page.getByRole("region", { name: "From your calendar" });
  const row = (title: string) => card.getByRole("listitem").filter({ hasText: title });
  const ics = await icsFor(page, [
    ["d1", "Dentist checkup", [9, 0], [9, 30]],
    ["d2", "Dentist follow-up", [13, 0], [13, 45]],
  ]);
  await page
    .getByLabel("Choose calendar file")
    .setInputFiles({ name: "work.ics", mimeType: "text/calendar", buffer: Buffer.from(ics) });

  await test.step("no title names a project, so both ask", async () => {
    await expect(row("Dentist checkup").getByRole("combobox")).toHaveValue("");
    await expect(row("Dentist follow-up").getByRole("combobox")).toHaveValue("");
  });

  await test.step("picking General by hand and adding it offers the rule; one tap keeps it", async () => {
    await row("Dentist checkup").getByRole("combobox").selectOption({ label: "General" });
    await row("Dentist checkup").getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Added. Always put “dentist” meetings on General?")).toBeVisible();
    await page.getByRole("button", { name: "Always", exact: true }).click();
    await expect(page.getByText("“dentist” meetings now go on General.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Today's entries" }).getByText("Dentist checkup")).toBeVisible();
  });

  await test.step("the other dentist meeting now comes with General picked, says why, and adds in one tap", async () => {
    await expect(row("Dentist follow-up").getByRole("combobox")).not.toHaveValue("");
    await expect(row("Dentist follow-up")).toContainText("your rule for “dentist”");
    await page.reload();
    await expect(row("Dentist follow-up").getByRole("combobox")).not.toHaveValue(""); // kept in this browser
    const stored = await page.evaluate(() => localStorage.getItem("hourly:calendarRules"));
    expect(stored).toContain('"word":"dentist"');
  });

  await test.step("Forget my meeting rule removes it: the meeting asks again", async () => {
    await card.getByRole("button", { name: "Forget my meeting rule" }).click();
    await expect(row("Dentist follow-up").getByRole("combobox")).toHaveValue("");
    await expect(row("Dentist follow-up")).not.toContainText("your rule");
    expect(await page.evaluate(() => localStorage.getItem("hourly:calendarRules"))).toBeNull();
  });
});

test("the last working day with no time gets one calm line: Add it now opens it, Not now hides it for that day", async ({
  page,
}) => {
  await startFreshAccount(page);
  // The page's own local dates (the app works out "today" in the browser).
  const { weekAgo, lastWorkday, weekdayName } = await page.evaluate(() => {
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const back = (n: number) => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - n);
      return d;
    };
    let n = 1;
    while ([0, 6].includes(back(n).getDay())) n++;
    return {
      weekAgo: iso(back(7)),
      lastWorkday: iso(back(n)),
      weekdayName: new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(back(n)),
    };
  });
  const line = page.getByRole("region", { name: "Missed day" });

  await test.step("a new account is not told off", async () => {
    await expect(page.getByRole("region", { name: "This day" })).toBeVisible();
    await expect(line).toHaveCount(0);
  });

  await test.step("time a week ago, nothing since: the day card says the last working day has nothing", async () => {
    await page.goto(`/dashboard/today?date=${weekAgo}`);
    await page.getByLabel("Time to add").fill("1");
    await page.getByRole("button", { name: /^Log time/ }).click();
    await expect(page.getByText(/1:00 this day/).first()).toBeVisible();
    await page.goto("/dashboard/today");
    await expect(line).toContainText(`Nothing logged on ${weekdayName}.`);
    await expect(
      page.getByRole("region", { name: "This day" }).getByRole("region", { name: "Missed day" }),
    ).toHaveCount(1); // inside the day card: the one place that tells about missed days
    // the same day is not also a "No time:" button
    await expect(page.getByRole("navigation", { name: "Days with no time" }).getByRole("button")).not.toHaveCount(0);
    const chipLabels = await page
      .getByRole("navigation", { name: "Days with no time" })
      .getByRole("button")
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
    expect(chipLabels.some((l) => l.startsWith(`${weekdayName},`) && l.includes("no time logged"))).toBe(false);
  });

  await test.step("Add it now opens that day", async () => {
    await line.getByRole("button", { name: /^Add it now/ }).click();
    await expect(page).toHaveURL(new RegExp(`date=${lastWorkday}$`));
    await expect(line).toHaveCount(0); // not while that day is open
    await page.getByRole("button", { name: "Back to today" }).click();
    await expect(page).toHaveURL(/\/dashboard\/today$/);
  });

  await test.step("Not now hides it for that date, even after a reload; the day stays reachable as a quiet button", async () => {
    await line.getByRole("button", { name: "Not now" }).click();
    await expect(line).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("region", { name: "This day" })).toBeVisible();
    await expect(line).toHaveCount(0);
    await expect(
      page
        .getByRole("navigation", { name: "Days with no time" })
        .getByRole("button", { name: new RegExp(`^${weekdayName},`) }),
    ).toBeVisible();
  });
});
