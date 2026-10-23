import sharp from "sharp";

import { FEATURES } from "../src/lib/features";
import { expect, startFreshAccount, test } from "./helpers";

test.skip(!FEATURES.avatar, "Profile pictures are hidden in this release (src/lib/features.ts)");

/**
 * The position editor for the picture at the top right: choose a file, move and zoom it inside the round frame,
 * then save. The test picture is three bands side by side (red, green, blue), so what was saved can be read back.
 */
const BANDS = async () =>
  sharp({
    create: { width: 900, height: 300, channels: 3, background: "#00ff00" },
  })
    .composite([
      { input: { create: { width: 300, height: 300, channels: 3, background: "#ff0000" } }, left: 0, top: 0 },
      { input: { create: { width: 300, height: 300, channels: 3, background: "#0000ff" } }, left: 600, top: 0 },
    ])
    .png()
    .toBuffer();

/** The colour at the middle of the saved picture, read from the image in the top bar. */
const centreColour = (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>('button[aria-label^="Account menu for"] img');
    if (!img) return "no picture";
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return "no canvas";
    ctx.drawImage(img, 0, 0);
    const [r, g, b] = ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data;
    return r > 150 && g < 100 && b < 100
      ? "red"
      : g > 150 && r < 100 && b < 100
        ? "green"
        : b > 150 && r < 100 && g < 100
          ? "blue"
          : `${r},${g},${b}`;
  });

test("a picture can be moved and zoomed inside the round frame before it is saved", async ({ page }) => {
  await startFreshAccount(page);
  const trigger = page.getByRole("button", { name: /Account menu for/ });
  const file = page.getByLabel("Choose your picture file");
  const frame = page.getByRole("group", { name: /Picture position/ });
  const picture = { name: "bands.png", mimeType: "image/png", buffer: await BANDS() };

  await test.step("it opens in the middle of the picture, and Cancel saves nothing", async () => {
    await file.setInputFiles(picture);
    await expect(page.getByRole("heading", { name: "Adjust your picture" })).toBeVisible();
    await expect(frame).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Adjust your picture" })).toHaveCount(0);
    await expect(trigger.locator("img")).toHaveCount(0);
  });

  await test.step("saved untouched it keeps the middle (green)", async () => {
    await file.setInputFiles(picture);
    await page.getByRole("button", { name: "Save picture" }).click();
    await expect(page.getByText("Picture saved.")).toBeVisible();
    await expect(trigger.locator("img")).toBeVisible();
    expect(await centreColour(page)).toBe("green");
  });

  await test.step("dragging the picture right shows more of its left side (red)", async () => {
    await file.setInputFiles(picture);
    const box = await frame.boundingBox();
    if (!box) throw new Error("no frame");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.getByRole("button", { name: "Save picture" }).click();
    await expect(page.getByText("Picture saved.").last()).toBeVisible();
    await expect.poll(() => centreColour(page)).toBe("red");
  });

  await test.step("the arrow keys move the view: left shows more of the left (red), right more of the right (blue), and the zoom slider works", async () => {
    await file.setInputFiles(picture);
    await frame.focus();
    for (let i = 0; i < 60; i++) await page.keyboard.press("ArrowRight"); // the view moves right: more of the right side
    const zoom = page.getByLabel("Zoom", { exact: true });
    await zoom.fill("2");
    await expect(zoom).toHaveValue("2");
    await page.getByRole("button", { name: "Save picture" }).click();
    await expect.poll(() => centreColour(page)).toBe("blue");
  });
});
