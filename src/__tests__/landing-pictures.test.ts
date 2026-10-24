import { describe, expect, it } from "vitest";

import { existsSync, readFileSync } from "node:fs";

/**
 * Issue 221: the home page's "See it working" deck showed 1440-wide full pages shrunk into the window, so the text was
 * small and the lower third empty. The pictures are now a tight 1120x1008 window (10:9, saved 1400x1260), light and
 * dark, and the deck's box has the same shape, so nothing is cropped or left blank by the frame.
 */

const NAMES = ["1-today", "2-week", "3-month", "4-invoices", "5-clients", "6-year"];

/** Width and height of a WebP file (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  expect(b.toString("ascii", 0, 4)).toBe("RIFF");
  expect(b.toString("ascii", 8, 12)).toBe("WEBP");
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8X") return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  throw new Error(`unknown WebP chunk ${kind} in ${path}`);
}

describe("the home page screens deck pictures", () => {
  it("are tight 10:9 windows in light and dark, all the same size", () => {
    for (const dir of ["public/landing/tour", "public/landing/tour-dark"]) {
      for (const name of NAMES) {
        const file = `${dir}/${name}.webp`;
        expect(existsSync(file), file).toBe(true);
        expect(webpSize(file), file).toEqual({ w: 1400, h: 1260 });
      }
    }
  });

  it("have a phone picture of each screen in light and dark", () => {
    for (const dir of ["public/landing/tour-phone", "public/landing/tour-phone-dark"]) {
      for (const name of NAMES) {
        const size = webpSize(`${dir}/${name}.webp`);
        expect(size.w).toBe(540);
        expect(size.h).toBe(960);
      }
    }
  });

  it("are shown in a box of the same shape, at the size they really are", () => {
    const deck = readFileSync("src/components/landing-showcase.tsx", "utf8");
    expect(deck).toContain("sm:aspect-[10/9]");
    expect(deck.match(/width=\{(\d+)\}/g)).toEqual(["width={1400}", "width={1400}"]);
    expect(deck.match(/height=\{(\d+)\}/g)).toEqual(["height={1260}", "height={1260}"]);
  });
});
