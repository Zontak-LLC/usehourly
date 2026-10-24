// Draws every icon file from the one mark (the geometry of src/app/icon.svg).
//   node scripts/logo/render-icons.mjs
// Writes: src/app/apple-icon.png, src/app/favicon.ico, public/icons/icon-192.png, icon-512.png, maskable-512.png and
// android/store/app-icon-512.png. Uses sharp (already installed with Next.js).

import sharp from "sharp";

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const TILE = "#2563c9"; // colour-ok: the ocean blue accent (--amber); a static file cannot read CSS variables
const INK = "#ffffff";
// The mark: the thin clock at ten past ten on the solid blue tile (same geometry as src/app/icon.svg). `radius` rounds the
// tile (0 = a full square, for icons the system rounds itself); `scale` shrinks the clock only, so a maskable icon is
// full-bleed blue with the clock inside the central 80%.
const H = (scale) =>
  `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)"><circle cx="32" cy="32" r="19" fill="none" stroke="${INK}" stroke-width="3.5"/><line x1="32" y1="32" x2="24.2" y2="27.5" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="32" x2="43.3" y2="25.5" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="32" r="2.6" fill="${INK}"/></g>`;
const svg = ({ radius, scale = 1 }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${radius}" fill="${TILE}"/>${H(scale)}</svg>`;

const png = (spec, size) =>
  sharp(Buffer.from(svg(spec)), { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
const save = async (file, spec, size) => writeFileSync(resolve(root, file), await png(spec, size));

await save("public/icons/icon-192.png", { radius: 14 }, 192);
await save("public/icons/icon-512.png", { radius: 14 }, 512);
await save("android/store/app-icon-512.png", { radius: 14 }, 512);
// Maskable: full bleed, and the mark inside the central 80% so no phone's mask can cut it.
await save("public/icons/maskable-512.png", { radius: 0, scale: 0.8 }, 512);
// iOS rounds the corners itself and fills transparent ones with black, so this one is a full square.
await save("src/app/apple-icon.png", { radius: 0 }, 180);

// favicon.ico: PNG images inside an ICO container (16, 32, 48).
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((s) => png({ radius: 14 }, s)));
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = images.map((img, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(sizes[i], 0);
  e.writeUInt8(sizes[i], 1);
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(img.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += img.length;
  return e;
});
writeFileSync(resolve(root, "src/app/favicon.ico"), Buffer.concat([header, ...entries, ...images]));
console.log("icons written");
