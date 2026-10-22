import { expect, startDemo, test } from "./helpers";

/**
 * On a phone a dialog sits at the TOP of the screen, so the on-screen keyboard (which covers the lower part) never hides
 * the field being typed in. The keyboard is simulated by shrinking the window to the height left above it.
 */
test("a dialog on a phone stays above the keyboard, and the field being typed in is visible", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone", "only phones have an on-screen keyboard");
  // The sample account has several projects, so Today offers "Another project…": a chooser dialog with a search box.
  await startDemo(page);
  await page.getByRole("button", { name: /Another project/ }).click();
  const dialog = page.getByRole("dialog");
  const field = dialog.getByRole("textbox").first();
  await expect(field).toBeVisible();

  const full = page.viewportSize()?.height ?? 800;
  const box = await dialog.boundingBox();
  expect(box?.y ?? 999).toBeLessThan(40); // anchored to the top, not centred

  // the keyboard takes roughly the lower 45% of the screen
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 412, height: Math.round(full * 0.55) });
  const field2 = await field.boundingBox();
  expect((field2?.y ?? 999) + (field2?.height ?? 0)).toBeLessThan(Math.round(full * 0.55)); // the field is above the keyboard
  await field.fill("mob");
  await expect(field).toHaveValue("mob");
});
