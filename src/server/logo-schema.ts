import { z } from "zod";

const logoOfMax = (max: number) =>
  z
    .string()
    .max(max, "That logo is too large.")
    .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, "Logo must be a PNG or JPEG image.")
    .nullable();

/**
 * A logo is stored as a small png/jpeg data URL (resized in the browser); null clears it. The browser
 * never produces more than 300,000 characters for a business or client logo (it switches to JPEG past
 * that) or much more than 60,000 for a 160x160 project logo, so the ceilings sit just above those.
 */
export const logoSchema = logoOfMax(300_000);
export const projectLogoSchema = logoOfMax(100_000);
