import { entryAction, expect, startFreshAccount, test } from "./helpers";

/**
 * Local-first spike (issue #95). With the switch on, entries are kept in this browser and shown from there; changes
 * made with no connection are sent when it returns, and a second device sees them.
 */
const serverEntries = async (page: import("@playwright/test").Page) => {
  // The day the app shows is the BROWSER's local date, which differs from the UTC date for part of every day.
  const day = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const input = encodeURIComponent(JSON.stringify({ 0: { from: day, to: day } }));
  const res = await page.request.get(`/api/trpc/entry.list?batch=1&input=${input}`);
  const body = (await res.json()) as { result: { data: { note: string; minutes: number }[] } }[];
  return body[0].result.data;
};

test("entries added, edited and deleted offline reach the server once the connection returns", async ({ page }) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/account#data");
  await expect(page.getByText("Keep a copy on this device (experimental)")).toBeVisible();
  await page.getByRole("button", { name: "Turn on" }).click(); // reloads the page with the copy switched on
  await expect(page.getByText("Everything is sent.")).toBeVisible({ timeout: 20_000 });

  await page.goto("/dashboard/today");
  await expect(page.getByLabel("Time to add")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-local-first", "ready"); // the copy is open and answering
  // Clients and projects are not kept on the device yet, so they must have loaded before the connection goes.
  await expect(page.getByText("Offline Co").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.context().setOffline(true);

  const add = async (time: string, note: string) => {
    await page.getByLabel("Time to add").fill(time);
    await page.getByLabel("Description").fill(note);
    await page.getByRole("button", { name: /Add to the day/ }).click();
    await expect(page.getByText(note)).toBeVisible(); // shown at once, from the device
  };
  await add("2h", "kept offline");
  await add("30m", "also offline");
  await add("10m", "to be deleted");

  // Edits and deletes work with no connection too.
  const row = (note: string) => page.getByRole("listitem").filter({ hasText: note });
  await row("kept offline").hover();
  await row("kept offline").getByRole("button", { name: "Edit", exact: true }).click({ force: true });
  await page.getByLabel("Time", { exact: true }).fill("3:00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("3:00").first()).toBeVisible();
  await row("to be deleted").hover();
  await entryAction(row("to be deleted"), "Delete");
  await page.getByRole("button", { name: "Delete entry" }).click();
  await expect(page.getByText("to be deleted")).toHaveCount(0);
  await expect(page.getByLabel("Offline status")).not.toContainText(/\d+ saved/); // the old queue is not involved

  await page.context().setOffline(false);
  await expect
    .poll(async () => (await serverEntries(page)).map((e) => e.note).sort(), { timeout: 30_000 })
    .toEqual(["also offline", "kept offline"]);
  expect((await serverEntries(page)).find((e) => e.note === "kept offline")?.minutes).toBe(180);

  // A reload shows the same list, now from the device, and nothing is doubled.
  await page.reload();
  await expect(page.getByText("kept offline")).toHaveCount(1);
  await expect(page.getByText("also offline")).toHaveCount(1);
});
