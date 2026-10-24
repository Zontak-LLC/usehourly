// Draws every icon file from the one mark, the Hex Clock (the geometry of src/app/icon.svg).
//   node scripts/logo/render-icons.mjs
// Writes: src/app/apple-icon.png, src/app/favicon.ico, public/icons/icon-192.png, icon-512.png, maskable-512.png and
// android/store/app-icon-512.png. Uses sharp (already installed with Next.js).

import sharp from "sharp";

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const ACCENT = "#2563c9"; // colour-ok: the ocean blue accent (--amber); a static file cannot read CSS variables
const INK = "#ffffff";
const PAPER = "#ffffff"; // the opaque square behind the hexagon where a system needs one (iOS, Play, maskable)
// The mark, the Hex Clock (same geometry as src/app/icon.svg, viewBox 0 0 100 100): the rounded hexagon in the accent
// with a clock at ten past ten in white. Small sizes get thicker lines and no centre dot so the clock still reads
// (ring and hands 7 at 32px, 10 at 16px). `scale` shrinks the whole mark around the centre; `paper` puts it on an
// opaque white square (for icons the system masks or rounds itself).
const mark = ({ ring = 4.5, hands = 5, dot = true }) =>
  `<path d="M50,5 L89,27.5 V72.5 L50,95 L11,72.5 V27.5 Z" fill="${ACCENT}" stroke="${ACCENT}" stroke-width="6" stroke-linejoin="round"/><circle cx="50" cy="50" r="25" fill="none" stroke="${INK}" stroke-width="${ring}"/><path d="M50,50 L39,42 M50,50 L63,36" fill="none" stroke="${INK}" stroke-width="${hands}" stroke-linecap="round"/>${dot ? `<circle cx="50" cy="50" r="3.4" fill="${INK}"/>` : ""}`;
const svg = ({ scale = 1, paper = false, ...lines }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${paper ? `<rect width="100" height="100" fill="${PAPER}"/>` : ""}<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${mark(lines)}</g></svg>`;

const png = (spec, size) =>
  sharp(Buffer.from(svg(spec)), { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
const save = async (file, spec, size) => writeFileSync(resolve(root, file), await png(spec, size));

// PWA "any" icons: the hexagon on a transparent background.
await save("public/icons/icon-192.png", {}, 192);
await save("public/icons/icon-512.png", {}, 512);
// Play listing icon: Google masks it to a rounded square, so the hexagon sits on white with room around it.
await save("android/store/app-icon-512.png", { paper: true, scale: 0.86 }, 512);
// Maskable: full-bleed white, and the hexagon inside the central 80% (its corners reach 38.4 of the 40 safe radius).
await save("public/icons/maskable-512.png", { paper: true, scale: 0.8 }, 512);
// iOS rounds the corners itself and fills transparent ones with black, so this one is a full white square.
await save("src/app/apple-icon.png", { paper: true, scale: 0.86 }, 180);

// favicon.ico: PNG images inside an ICO container (16, 32, 48).
const sizes = [16, 32, 48];
const small = (s) => (s <= 16 ? { ring: 10, hands: 10, dot: false } : { ring: 7, hands: 7, dot: false });
const images = await Promise.all(sizes.map((s) => png(small(s), s)));
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
