const LOGO_MAX_W = 480;
const LOGO_MAX_H = 240;

/** Downscale to fit LOGO_MAX_W×H and re-encode, so stored logos stay small (and always png/jpeg). */
export async function fileToLogo(
  file: File,
  box: { maxW: number; maxH: number } = { maxW: LOGO_MAX_W, maxH: LOGO_MAX_H },
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG or JPEG).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't read that image."));
      i.src = url;
    });
    const scale = Math.min(box.maxW / img.naturalWidth, box.maxH / img.naturalHeight, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't process that image in this browser.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL("image/png"); // keeps transparency
    if (png.length <= 300_000) return png;
    // Photo-like logos: PNG is huge, so flatten onto white and use JPEG.
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const AVATAR_SIZE = 128;

/** Reads an image file into an element, for the picture editor. The caller revokes `url` when done. */
export async function loadImageFile(file: File): Promise<{ url: string; img: HTMLImageElement }> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG or JPEG).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't read that image."));
      i.src = url;
    });
    return { url, img };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/** The chosen square of the image (see lib/avatar-crop.ts), 128x128, as a small JPEG (a few KB). */
export function renderAvatar(img: HTMLImageElement, rect: { sx: number; sy: number; side: number }): string {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image in this browser.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.drawImage(img, rect.sx, rect.sy, rect.side, rect.side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  return canvas.toDataURL("image/jpeg", 0.85);
}
