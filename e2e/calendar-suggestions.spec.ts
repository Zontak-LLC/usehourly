import { expect, startFreshAccount, test } from "./helpers";

/**
 * Issue #99, slice 1: a calendar file imported on Today shows that day's meetings as one-tap suggestions. The file is
 * read in the browser; nothing is added until Add is pressed.
 */
const icsFor = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const stamp = (h: number, m: number) =>
      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), h, m)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const event = (uid: string, title: string, from: string, to: string, extra: string[] = []) =>
      ["BEGIN:VEVENT", `UID:${uid}`, `DTSTART:${from}`, `DTEND:${to}`, `SUMMARY:${title}`, ...extra, "END:VEVENT"].join(
        "\r\n",
      );
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Test//EN",
      event("m1", "Offline Co planning", stamp(10, 0), stamp(10, 45)),
      event("m2", "Dentist", stamp(13, 0), stamp(14, 0)),
      event("m3", "Focus time", stamp(15, 0), stamp(16, 0), ["TRANSP:TRANSPARENT"]),
      event("m4", "Cancelled call", stamp(16, 0), stamp(17, 0), ["STATUS:CANCELLED"]),
      "END:VCALENDAR",
    ].join("\r\n");
  });

test("a calendar file turns the day's meetings into one-tap suggestions, and nothing is added without a tap", async ({
  page,
}) => {
  await startFreshAccount(page);
  const card = page.getByRole("region", { name: "From your calendar" });
  const file = page.getByLabel("Choose calendar file");
  const calendar = { name: "work.ics", mimeType: "text/calendar", buffer: Buffer.from(await icsFor(page)) };

  await test.step("before a file is added, Today explains it and offers to add one", async () => {
    await expect(card).toContainText("Turn meetings into time entries");
    await expect(card.getByRole("button", { name: "Add a calendar file" })).toBeVisible();
  });

  await test.step("a file that is not a calendar is refused in plain words and nothing is kept", async () => {
    await file.setInputFiles({ name: "notes.ics", mimeType: "text/calendar", buffer: Buffer.from("just some words") });
    await expect(page.getByText(/doesn't look like a calendar file/)).toBeVisible();
    await expect(card).toContainText("Turn meetings into time entries");
  });

  await test.step("a real file shows the day's meetings; free, cancelled and untitled-by-rule events are left out", async () => {
    await file.setInputFiles(calendar);
    await expect(page.getByText("Read 2 meetings.")).toBeVisible();
    await expect(card.getByText("Offline Co planning")).toBeVisible();
    await expect(card.getByText(/10:00.*0:45/)).toBeVisible();
    await expect(card.getByText("Dentist")).toBeVisible();
    await expect(card.getByText("Focus time")).toHaveCount(0);
    await expect(card.getByText("Cancelled call")).toHaveCount(0);
  });

  await test.step("the meeting that names the client has its project chosen; the other asks, and cannot be added yet", async () => {
    const planning = card.getByRole("listitem").filter({ hasText: "Offline Co planning" });
    const dentist = card.getByRole("listitem").filter({ hasText: "Dentist" });
    await expect(planning.getByRole("combobox")).toHaveValue(/.+/);
    await expect(planning.getByRole("button", { name: "Add" })).toBeEnabled();
    await expect(dentist.getByRole("combobox")).toHaveValue("");
    await expect(dentist.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  await test.step("nothing was logged by importing", async () => {
    await expect(page.getByRole("region", { name: "Today's timesheet" })).toHaveCount(0);
  });

  await test.step("Add logs it with the meeting's title and length, and it leaves the list", async () => {
    await card
      .getByRole("listitem")
      .filter({ hasText: "Offline Co planning" })
      .getByRole("button", { name: "Add" })
      .click();
    const today = page.getByRole("region", { name: "Today's timesheet" });
    await expect(today.getByText("Offline Co planning")).toBeVisible();
    await expect(today.getByText("0:45").first()).toBeVisible();
    await expect(card.getByText("Offline Co planning")).toHaveCount(0);
  });

  await test.step("Skip hides a meeting for good, even after a reload", async () => {
    await card.getByRole("button", { name: "Skip Dentist" }).click();
    await expect(card.getByText("No meetings to log for this day.")).toBeVisible();
    await page.reload();
    await expect(card.getByText("Dentist")).toHaveCount(0);
    await expect(card.getByText("No meetings to log for this day.")).toBeVisible(); // the calendar is still there
  });

  await test.step("Remove calendar forgets it", async () => {
    await card.getByRole("button", { name: "Remove calendar" }).click();
    await expect(card).toContainText("Turn meetings into time entries");
    await page.reload();
    await expect(card).toContainText("Turn meetings into time entries");
  });
});
