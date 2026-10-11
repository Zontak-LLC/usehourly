import { z } from "zod";

/** A logo is stored as a small png/jpeg data URL (resized in the browser); null clears it. */
export const logoSchema = z
  .string()
  .max(400_000, "That logo is too large.")
  .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, "Logo must be a PNG or JPEG image.")
  .nullable();
