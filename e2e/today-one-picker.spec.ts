import { addProjects, expect, pastTimerLock, startFreshAccount, test } from "./helpers";

/**
 * One project picker on Today (issue 218): the timer has no chooser of its own. It starts on the project picked in the
 * Log time card, runs at the top of that card, and the time it saves is on that project.
 */
test("the timer starts on the project picked in Log time and runs inside the same card", async ({ page }) => {
  await startFreshAccount(page, "Acme");
  await addProjects(page, ["Design"]);
  await page.reload();
  const card = page.getByRole("region", { name: /^Log time/ });
  await expect(card.getByRole("radio", { name: /Design/ })).toBeVisible();

  await test.step("one picker: no separate timer project control", async () => {
    await expect(page.getByLabel("Timer project")).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: /Timer project/ })).toHaveCount(0);
  });

  await test.step("pick the second project, then start: the line names it", async () => {
    await card.getByRole("radio", { name: /Design/ }).click();
    await expect(card.getByRole("radio", { name: /Design/ })).toHaveAttribute("aria-checked", "true");
    const line = card.getByRole("region", { name: "Timer" });
    await expect(line).toContainText("Design"); // "Acme / Design" on a wide screen, the project alone on a phone
    await expect(line).not.toContainText("General");
    await line.getByRole("button", { name: "Start timer" }).click();
  });

  const strip = card.getByRole("region", { name: "Timer" });
  await test.step("the running strip names project B and sits at the top of the Log time card", async () => {
    await expect(strip.getByRole("button", { name: "Stop timer" })).toBeVisible();
    await expect(strip).toContainText("Design");
    await expect(strip).not.toContainText("General");
    await expect(strip.getByRole("button", { name: "Stop timer" })).toHaveAttribute(
      "title",
      "Stop the timer on Design",
    );
    const stripY = (await strip.boundingBox())?.y ?? 999;
    const timeY = (await card.getByLabel("Time to add").boundingBox())?.y ?? 0;
    expect(stripY).toBeLessThan(timeY); // above the form inside the card
    await expect(page.getByRole("region", { name: "This day" }).getByRole("region", { name: "Timer" })).toHaveCount(0);
  });

  await test.step("stop: the saved entry is on project B", async () => {
    await pastTimerLock(page);
    await strip.getByRole("button", { name: "Stop timer" }).click();
    await expect(strip.getByRole("group", { name: /Saved time/ })).toBeVisible();
    await expect(strip).toContainText(/Saved 0:01 · Design/);
    const entries = page.getByRole("region", { name: "Today's entries" });
    await expect(entries).toContainText("Design");
    await expect(entries).not.toContainText("General");
  });
});
