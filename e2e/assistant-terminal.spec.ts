import { expect, test } from "./helpers";

/** The home page's Claude Code window: it types its job when it scrolls into view, and stands still when asked. */
test.describe("assistant terminal on the home page", () => {
  test("types the request, then a tool call, as it plays", async ({ page }) => {
    await page.goto("/");
    const screen = page.locator("#ai-assistants pre");
    await screen.scrollIntoViewIfNeeded();
    // It restarts from an empty screen when it scrolls into view, then the typed request fills in.
    await expect(screen).toContainText("Make last week", { timeout: 15_000 });
    await expect(screen).toContainText("list_clients", { timeout: 15_000 });
    // The window has a readable description for a screen reader (its text is decoration).
    await expect(page.getByRole("img", { name: /Claude Code with UseHourly connected/ })).toBeVisible();
    await expect(page.getByText("claude mcp add --transport http usehourly").first()).toBeVisible();
  });

  test("with reduced motion it shows the finished screen at once and never moves", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const screen = page.locator("#ai-assistants pre");
    await screen.scrollIntoViewIfNeeded();
    await expect(screen).toContainText("37 hours, 3 invoices, $3,310.00");
    await expect(screen).toContainText("INV-2026-016");
  });
});
