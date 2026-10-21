/**
 * The private calendar address a person pastes (issue #99, slice 2). The browser keeps it; the server only passes it
 * through once per refresh, because calendar hosts do not allow a web page to read them directly.
 *
 * Because the server fetches whatever address it is given, the rules here are the whole defence against making the
 * server read something it should not (an internal address, a different kind of site): https only, no password, no
 * port, and only the hosts of the big calendar services.
 */
export const MAX_LINK_CHARS = 2000;

/** Hosts that publish a private iCalendar feed. iCloud uses a numbered server (p12-caldav.icloud.com). */
const EXACT_HOSTS = new Set(["calendar.google.com", "outlook.office365.com", "outlook.live.com"]);
const ICLOUD_HOST = /^p(\d{1,3})-caldav\.icloud\.com$/;

export type LinkCheck = { ok: true; url: string } | { ok: false; message: string };

/**
 * The host to contact, written out from our own list (never the pasted text), or null when it is not a calendar host.
 * The address that is fetched is built on this, so what the person typed can only ever choose the path.
 */
function knownHost(host: string): string | null {
  const h = host.toLowerCase();
  for (const known of EXACT_HOSTS) if (known === h) return known;
  const icloud = ICLOUD_HOST.exec(h);
  return icloud ? `p${Number(icloud[1])}-caldav.icloud.com` : null;
}

/** Turns what was pasted into the https address to fetch, or says in plain words why not. */
export function checkCalendarLink(input: string): LinkCheck {
  const text = input.trim();
  if (!text) return { ok: false, message: "Paste the calendar's private address first." };
  if (text.length > MAX_LINK_CHARS) return { ok: false, message: "That address is too long to be a calendar link." };
  // Apple and Outlook hand out webcal:// addresses; they are https underneath.
  const asHttps = text.replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(asHttps);
  } catch {
    return { ok: false, message: "That doesn't look like a web address." };
  }
  if (url.protocol !== "https:") return { ok: false, message: "The calendar address must start with https://." };
  if (url.username || url.password || url.port) {
    return { ok: false, message: "That doesn't look like a calendar's private address." };
  }
  const host = knownHost(url.hostname);
  if (!host) {
    return {
      ok: false,
      message:
        "Only Google, Outlook and iCloud calendar addresses work here. For another calendar, add a file instead.",
    };
  }
  return { ok: true, url: `https://${host}${url.pathname}${url.search}` };
}

/** A short label for the saved address that does not reveal its secret part. */
export function describeCalendarLink(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host === "calendar.google.com") return "Google Calendar";
    if (host.startsWith("outlook.")) return "Outlook calendar";
    if (ICLOUD_HOST.test(host)) return "iCloud calendar";
    return host;
  } catch {
    return "Calendar link";
  }
}
