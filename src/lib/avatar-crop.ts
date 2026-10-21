/**
 * Positioning a picture inside the round frame (the Account picture and the top bar), the way a profile editor does:
 * drag to move, zoom to make the face bigger. The maths is kept here, apart from the screen, so it can be tested.
 *
 * A crop is the CENTRE of the visible square in image pixels plus a zoom (1 = the largest square that fits, the
 * middle of the picture; 4 = a quarter of that side). The centre is always kept so the square stays inside the image.
 */
export const MAX_ZOOM = 4;

export type Size = { w: number; h: number };
export type Crop = { zoom: number; cx: number; cy: number };

/** Side of the visible square, in image pixels. */
export const visibleSide = (img: Size, zoom: number) => Math.min(img.w, img.h) / zoom;

/** Zoom within 1 to MAX_ZOOM and the centre within the image, so the square never hangs over an edge. */
export function clampCrop(img: Size, crop: Crop): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, Number.isFinite(crop.zoom) ? crop.zoom : 1));
  const half = visibleSide(img, zoom) / 2;
  return {
    zoom,
    cx: Math.min(img.w - half, Math.max(half, crop.cx)),
    cy: Math.min(img.h - half, Math.max(half, crop.cy)),
  };
}

/** Start in the middle of the picture, as before the editor existed. */
export const initialCrop = (img: Size): Crop => ({ zoom: 1, cx: img.w / 2, cy: img.h / 2 });

/** The picture follows the pointer: dragging it right by `dx` screen pixels shows more of what is on its left. */
export function panCrop(img: Size, crop: Crop, dx: number, dy: number, viewport: number): Crop {
  const perPixel = visibleSide(img, crop.zoom) / viewport; // image pixels per screen pixel
  return clampCrop(img, { ...crop, cx: crop.cx - dx * perPixel, cy: crop.cy - dy * perPixel });
}

/** Change the zoom around the same centre. */
export const zoomCrop = (img: Size, crop: Crop, zoom: number): Crop => clampCrop(img, { ...crop, zoom });

/** The square to cut out of the image, in image pixels. */
export function cropRect(img: Size, crop: Crop): { sx: number; sy: number; side: number } {
  const c = clampCrop(img, crop);
  const side = visibleSide(img, c.zoom);
  return { sx: c.cx - side / 2, sy: c.cy - side / 2, side };
}

/** Where to draw the whole image inside a square frame of `viewport` screen pixels so that the crop fills it. */
export function frameStyle(img: Size, crop: Crop, viewport: number) {
  const { sx, sy, side } = cropRect(img, crop);
  const scale = viewport / side;
  return { width: img.w * scale, height: img.h * scale, left: -sx * scale, top: -sy * scale };
}
