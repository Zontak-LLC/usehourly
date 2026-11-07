/**
 * A project's website (2026-11-06, migration 0041). The browser checks it before a save and the server checks it again
 * (the browser check can be skipped), so only an address that passed here is ever stored and drawn as a link.
 */
export const WEBSITE_ERROR = "That doesn't look like a web address. Try magsmith.com.";
const MAX_WEBSITE_CHARS = 300;

export type WebsiteCheck = { ok: true; url: string | null } | { ok: false; message: string };

// A scheme such as "javascript:" or "ftp:". "magsmith.com:8080" is a host and a port, not a scheme (a digit follows).
const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;
// At least two labels, no empty label, no space.
const DOTTED_HOST = /^[^.\s]+(\.[^.\s]+)+$/;

/** Turns what was typed into a full http(s) address, null for an empty box, or the plain error. */
export function parseWebsite(input: string | null | undefined): WebsiteCheck {
  const text = (input ?? "").trim();
  if (!text) return { ok: true, url: null };
  const fail = { ok: false, message: WEBSITE_ERROR } as const;
  if (text.length > MAX_WEBSITE_CHARS) return fail;
  const hasWebScheme = /^https?:\/\//i.test(text);
  if (!hasWebScheme && OTHER_SCHEME.test(text)) return fail;
  let url: URL;
  try {
    url = new URL(hasWebScheme ? text : `https://${text}`);
  } catch {
    return fail;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return fail;
  if (url.username || url.password || url.port) return fail;
  if (!DOTTED_HOST.test(url.hostname)) return fail;
  const full = url.toString();
  return full.length > MAX_WEBSITE_CHARS ? fail : { ok: true, url: full };
}
