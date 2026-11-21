import type { ConsoleMessage, Page, Response } from "@playwright/test";

/** Console messages that are noise in development, not problems with the app. */
// 400/401/403 are the app saying no on purpose (a wrong password, a refused send); 5xx and uncaught errors still fail.
// These net:: errors are what the browser logs when a test switches it offline or aborts a request on purpose.
const IGNORED = [
  /net::ERR_(INTERNET_DISCONNECTED|CONNECTION_FAILED|FAILED)/i,
  /Failed to fetch RSC payload/i, // Next logs this when a page change falls back to a normal page load while offline
  /favicon/i,
  /Download the React DevTools/i,
  /status of 40[013]/i,
  /\[Fast Refresh\]/i,
];

const SERVER_ERROR_TEXT = /status of 5\d\d/i;
const MAX_CONSOLE_TEXT = 3500;

/**
 * A 404 from a tRPC call is the server's NOT_FOUND on purpose (an entry deleted in another tab, issue 458), so it is not
 * a problem. A 404 for a page, script or picture still fails: Chromium logs the missing file's address as the location.
 */
const isDeliberateNotFound = (m: ConsoleMessage) =>
  /status of 404/i.test(m.text()) && m.location().url.includes("/api/trpc/");

type ServerError = { status: number; url: string; isPrefetch: boolean };
type ConsoleError = { text: string; url: string };

/**
 * Whether a request is a speculative prefetch (Cloudflare Speed Brain, `<link rel=prefetch>`): its `sec-purpose`
 * header contains `prefetch`, in any letter case. Takes Playwright's `request.allHeaders()` (lower-case keys).
 */
export function isSpeculativePrefetch(requestHeaders: Record<string, string>): boolean {
  return (requestHeaders["sec-purpose"] ?? "").toLowerCase().includes("prefetch");
}

// allHeaders(), not headers(): the synchronous one leaves out headers the browser's network stack adds, like Sec-Purpose.
// If the headers cannot be read (the page closed), the 5xx counts as a real one.
async function readServerError(response: Response): Promise<ServerError> {
  const base = { status: response.status(), url: response.url() };
  try {
    return { ...base, isPrefetch: isSpeculativePrefetch(await response.request().allHeaders()) };
  } catch (error) {
    console.warn(`browser problems: could not read the request headers of ${base.url}, so its 5xx counts`, error);
    return { ...base, isPrefetch: false };
  }
}

const isNoise = (m: ConsoleMessage) => IGNORED.some((r) => r.test(m.text())) || isDeliberateNotFound(m);

// A prefetch answered 5xx also logs "status of 503" in the console, with the prefetched address as its location.
function isPrefetchEcho(error: ConsoleError, prefetchUrls: Set<string>): boolean {
  return SERVER_ERROR_TEXT.test(error.text) && prefetchUrls.has(error.url);
}

function listProblems(serverErrors: ServerError[], consoleErrors: ConsoleError[], uncaught: string[]): string[] {
  const prefetchUrls = new Set(serverErrors.filter((e) => e.isPrefetch).map((e) => e.url));
  const http = serverErrors.filter((e) => !e.isPrefetch).map((e) => `HTTP ${e.status}: ${e.url}`);
  const consoleLines = consoleErrors
    .filter((e) => !isPrefetchEcho(e, prefetchUrls))
    .map((e) => `console error: ${e.text.slice(0, MAX_CONSOLE_TEXT)}`);
  return [...uncaught, ...consoleLines, ...http];
}

/**
 * Watches a page for uncaught errors, console errors and 5xx answers. Returns a reader that waits for every pending
 * header read, then lists the problems as lines. A 5xx answer to a speculative prefetch, and its console echo, are left out.
 */
export function watchBrowserProblems(page: Page): () => Promise<string[]> {
  const uncaught: string[] = [];
  const consoleErrors: ConsoleError[] = [];
  const pending: Promise<ServerError>[] = [];
  page.on("pageerror", (e) => uncaught.push(`uncaught error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !isNoise(m)) consoleErrors.push({ text: m.text(), url: m.location().url });
  });
  page.on("response", (r) => {
    if (r.status() >= 500) pending.push(readServerError(r));
  });
  return async () => listProblems(await Promise.all(pending), consoleErrors, uncaught);
}
