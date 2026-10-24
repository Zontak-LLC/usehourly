// Logs a plausible morning on TODAY in the sample-data demo through the real Log time form, so the Today picture shows
// today's date with a full timesheet (issue 252: the demo has no entries today, so the picture used a past day and read
// "9 days ago · Back to today", and the short page left an empty band at the foot of the window).
const ENTRIES = [
  ["1h30", "Sprint planning and estimates for the checkout redesign"],
  ["2h", "Built the new mobile menu and fixed the focus order"],
  ["45m", "Client call: reviewed the invoice layout"],
];

export async function fillToday(page, base) {
  await page.goto(`${base}/dashboard/today`);
  await page.waitForLoadState("networkidle");
  const projects = page.getByRole("radio");
  for (const [i, [time, note]] of ENTRIES.entries()) {
    if ((await projects.count()) > i) await projects.nth(i).click();
    await page.getByLabel("Time to add").fill(time);
    await page.getByLabel("Description").fill(note);
    await page.getByRole("button", { name: /^Log time/ }).click();
    await page.getByText(note).first().waitFor();
  }
  // The rows above show before the server confirms them: wait for every save to finish before the caller navigates.
  await page.waitForLoadState("networkidle");
  await page.reload();
  for (const [, note] of ENTRIES) await page.getByText(note).first().waitFor();
}
