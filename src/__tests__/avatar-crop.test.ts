import { describe, expect, it } from "vitest";

import { clampCrop, cropRect, frameStyle, initialCrop, MAX_ZOOM, panCrop, zoomCrop } from "@/lib/avatar-crop";

const WIDE = { w: 900, h: 300 };
const TALL = { w: 300, h: 900 };

describe("positioning a picture in the round frame", () => {
  it("starts on the middle of the picture, the largest square that fits", () => {
    expect(cropRect(WIDE, initialCrop(WIDE))).toEqual({ sx: 300, sy: 0, side: 300 });
    expect(cropRect(TALL, initialCrop(TALL))).toEqual({ sx: 0, sy: 300, side: 300 });
  });

  it("follows the pointer: dragging right shows more of the left, dragging up shows more of the bottom", () => {
    const frame = 240; // screen pixels; the visible square is 300 image pixels, so 1 screen pixel = 1.25 image pixels
    const right = panCrop(WIDE, initialCrop(WIDE), 80, 0, frame);
    expect(cropRect(WIDE, right).sx).toBeCloseTo(300 - 100, 5);
    const up = panCrop(TALL, initialCrop(TALL), 0, -80, frame);
    expect(cropRect(TALL, up).sy).toBeCloseTo(300 + 100, 5);
  });

  it("never lets the square leave the picture, however far it is dragged", () => {
    const far = panCrop(WIDE, initialCrop(WIDE), 100_000, 100_000, 240);
    expect(cropRect(WIDE, far)).toEqual({ sx: 0, sy: 0, side: 300 });
    const other = panCrop(WIDE, initialCrop(WIDE), -100_000, -100_000, 240);
    expect(cropRect(WIDE, other)).toEqual({ sx: 600, sy: 0, side: 300 });
  });

  it("zooms around the same centre, a smaller square each step, and stays inside the picture", () => {
    const start = panCrop(WIDE, initialCrop(WIDE), 80, 0, 240); // off-centre
    const zoomed = zoomCrop(WIDE, start, 2);
    expect(cropRect(WIDE, zoomed).side).toBe(150);
    expect(zoomed.cx).toBe(start.cx);
    // zooming out at an edge pulls the square back inside
    const edge = panCrop(WIDE, zoomCrop(WIDE, initialCrop(WIDE), 4), 100_000, 0, 240);
    const out = cropRect(WIDE, zoomCrop(WIDE, edge, 1));
    expect(out.sx).toBeGreaterThanOrEqual(0);
    expect(out.sx + out.side).toBeLessThanOrEqual(WIDE.w);
  });

  it("limits the zoom to 1 to 4 and ignores nonsense", () => {
    expect(clampCrop(WIDE, { zoom: 99, cx: 450, cy: 150 }).zoom).toBe(MAX_ZOOM);
    expect(clampCrop(WIDE, { zoom: 0.2, cx: 450, cy: 150 }).zoom).toBe(1);
    expect(clampCrop(WIDE, { zoom: Number.NaN, cx: 450, cy: 150 }).zoom).toBe(1);
  });

  it("places the whole image so the chosen square exactly fills the frame", () => {
    const crop = panCrop(WIDE, initialCrop(WIDE), 80, 0, 240);
    const { sx, side } = cropRect(WIDE, crop);
    const f = frameStyle(WIDE, crop, 240);
    expect(f.width).toBeCloseTo(WIDE.w * (240 / side), 5);
    expect(f.left).toBeCloseTo(-sx * (240 / side), 5);
    expect(f.top).toBeCloseTo(0, 5);
  });
});
