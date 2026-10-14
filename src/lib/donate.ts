/**
 * Hourly is free; people who find it useful can chip in. This is the one place the donation
 * address lives. While it is empty, every "Support Hourly" button and message stays hidden, so
 * nobody is ever sent to a page that does not exist yet.
 *
 * To switch donations on: set DONATE_URL to the live page (for GitHub Sponsors that is
 * https://github.com/sponsors/<user-or-org> once the profile is approved) and deploy.
 */
export const DONATE_URL: string = "https://github.com/sponsors/Zontak-LLC";
export const DONATE_PLATFORM: string = "GitHub Sponsors";

/** The address to use, or null when donations are not switched on (or the value is not a safe https link). */
export function donateUrl(raw: string = DONATE_URL): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
