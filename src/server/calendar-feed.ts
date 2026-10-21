import { checkCalendarLink } from "@/lib/calendar-link";

/** Bigger than this is not a normal calendar feed; stop reading. */
export const MAX_FEED_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

export type FeedResult = { ok: true; text: string } | { ok: false; status: 400 | 413 | 502 | 504; message: string };

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Fetches a calendar feed for the browser. Every address, the first and each redirect, must pass the same rules
 * (https, no password or port, a known calendar host), redirects are followed by hand so none can leave those hosts,
 * the wait is limited and so is the size. Nothing about the address is logged or returned in a message.
 */
export async function fetchCalendarFeed(link: string, fetcher: Fetcher = fetch): Promise<FeedResult> {
  let next = checkCalendarLink(link);
  if (!next.ok) return { ok: false, status: 400, message: next.message };
  let url = next.url;

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetcher(url, {
        redirect: "manual",
        signal,
        headers: { accept: "text/calendar, text/plain;q=0.5", "user-agent": "UseHourly calendar reader" },
      });
      if (res.status >= 300 && res.status < 400) {
        const where = res.headers.get("location");
        await res.body?.cancel();
        if (!where) return bad("The calendar service sent an odd answer. Check the address.");
        next = checkCalendarLink(new URL(where, url).toString());
        if (!next.ok) {
          return bad("The calendar service sent us somewhere we can't follow.");
        }
        url = next.url;
        continue;
      }
      if (res.status === 404 || res.status === 403 || res.status === 401 || res.status === 410) {
        await res.body?.cancel();
        return bad("The calendar service said no. The private address may have been reset: copy the new one.");
      }
      if (!res.ok) {
        await res.body?.cancel();
        return bad("The calendar service didn't answer properly. Try again in a moment.");
      }
      const text = await readLimited(res);
      if (text === null) return { ok: false, status: 413, message: "That calendar is too big to read this way." };
      return { ok: true, text };
    }
    return bad("The calendar service sent us round in circles.");
  } catch (err) {
    if (signal.aborted) return { ok: false, status: 504, message: "The calendar service took too long. Try again." };
    return bad(
      err instanceof Error && err.name === "TypeError"
        ? "Couldn't reach the calendar service."
        : "Couldn't read that calendar.",
    );
  }
}

const bad = (message: string): FeedResult => ({ ok: false, status: 502, message });

/** The body as text, or null when it is longer than the limit. */
async function readLimited(res: Response): Promise<string | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_FEED_BYTES) {
    await res.body?.cancel();
    return null;
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_FEED_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}
