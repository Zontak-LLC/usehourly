// Joins e2e/report/ui/before-<screen>-<device>.png and after-... side by side with labels:
//   node scripts/ui-compare.mjs clients [desktop|phone]
// Writes e2e/report/ui/compare-<screen>-<device>.png. (See e2e/ui-compare.spec.ts.)
import sharp from "sharp";

const [screen, device = "desktop"] = process.argv.slice(2);
if (!screen) throw new Error("usage: node scripts/ui-compare.mjs <screen> [desktop|phone]");
const dir = "e2e/report/ui";
const [before, after] = await Promise.all(
  ["before", "after"].map(async (l) => {
    const img = sharp(`${dir}/${l}-${screen}-${device}.png`);
    return { buf: await img.toBuffer(), meta: await img.metadata() };
  }),
);
const gap = 40;
const head = 64;
const height = Math.max(before.meta.height, after.meta.height) + head;
const width = before.meta.width + after.meta.width + gap;
const text = (x, t) =>
  `<text x="${x}" y="42" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#111">${t}</text>`;
const svg = Buffer.from(
  `<svg width="${width}" height="${head}" xmlns="http://www.w3.org/2000/svg">${text(16, "Before")}${text(before.meta.width + gap + 16, "After")}</svg>`,
);
await sharp({ create: { width, height, channels: 3, background: "#d4d4d8" } })
  .composite([
    { input: svg, top: 0, left: 0 },
    { input: before.buf, top: head, left: 0 },
    { input: after.buf, top: head, left: before.meta.width + gap },
  ])
  .png()
  .toFile(`${dir}/compare-${screen}-${device}.png`);
console.log(`${dir}/compare-${screen}-${device}.png`);
