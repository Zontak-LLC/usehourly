import { describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";
import vm from "node:vm";

const CODE = readFileSync(`${process.cwd()}/public/sw.js`, "utf8");
const ORIGIN = "https://app.test";

type Handler = (event: Record<string, unknown>) => void;
type Req = { method: string; url: string; mode: string; headers?: Headers };

/** A response that looks like a real same-origin one (type "basic"), with the redirect flag a test can set. */
function basic(body: string, init: ResponseInit = {}, redirected = false): Response {
  const res = new Response(body, init);
  Object.defineProperty(res, "type", { value: "basic" });
  Object.defineProperty(res, "redirected", { value: redirected });
  return res;
}

/** Loads the real public/sw.js into a sandbox with an in-memory cache, and lets a test fire its events. */
function loadWorker(network: (req: Req) => Promise<Response>, offlinePageRedirected = false) {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, Response>>();
  const urlOf = (r: string | Req) => (typeof r === "string" ? new URL(r, ORIGIN).toString() : r.url);
  const bucket = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name) as Map<string, Response>;
  };
  const caches = {
    open: async (name: string) => ({
      match: async (r: string | Req) => bucket(name).get(urlOf(r))?.clone(),
      put: async (r: string | Req, res: Response) => {
        bucket(name).set(urlOf(r), res);
      },
    }),
    match: async (r: string | Req) => {
      for (const b of store.values()) {
        const hit = b.get(urlOf(r));
        if (hit) return hit.clone();
      }
      return undefined;
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  };
  // the offline page is fetched when the worker installs; a host may answer with a redirect, which the worker must not keep as is
  const fetchMock = vi.fn(async (req: Req | string) => {
    const url = typeof req === "string" ? req : req.url;
    if (new URL(url, ORIGIN).pathname === "/offline.html") return basic("the offline page", {}, offlinePageRedirected);
    return network(req as Req);
  });
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  vm.runInNewContext(CODE, {
    self,
    caches,
    fetch: fetchMock,
    Response,
    URL,
    Promise,
    // the "this is taking too long" wait is shortened so the slow-network test does not take six seconds
    setTimeout: (fn: () => void, ms: number, ...args: unknown[]) =>
      setTimeout(fn, ms >= 6000 ? 5 : ms, ...(args as [])),
  });

  async function waitUntil(type: string, extra: Record<string, unknown> = {}) {
    let pending: Promise<unknown> = Promise.resolve();
    handlers[type]({
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
      ...extra,
    });
    await pending;
  }
  /** Fires a request through the worker. Undefined means the worker left it alone (the browser handles it itself). */
  async function request(req: Partial<Req> & { url: string; keep?: boolean }): Promise<Response | undefined> {
    let answer: Promise<Response> | undefined;
    handlers.fetch({
      request: {
        method: "GET",
        mode: "cors",
        headers: new Headers(req.keep ? { "x-keep": "1" } : {}),
        ...req,
        url: new URL(req.url, ORIGIN).toString(),
      },
      respondWith: (p: Promise<Response>) => {
        answer = p;
      },
    });
    return answer ? await answer : undefined;
  }
  return { self, store, fetchMock, waitUntil, request, handlers };
}

const page = (path: string) => ({ url: path, mode: "navigate" });
const text = async (res: Response | undefined) => (res ? await res.text() : undefined);

describe("the offline service worker", () => {
  it("keeps the offline page when installed, and on activation removes only its own old caches", async () => {
    const w = loadWorker(async () => basic("x"));
    await w.waitUntil("install");
    expect(w.self.skipWaiting).toHaveBeenCalled();
    expect([...w.store.keys()]).toEqual(["hourly-static-v1"]);

    // a redirected answer for the offline page is stored as a fresh, un-redirected response
    const redirecting = loadWorker(async () => basic("x"), true);
    await redirecting.waitUntil("install");
    const stored = redirecting.store.get("hourly-static-v1")?.get(`${ORIGIN}/offline.html`);
    expect(stored?.redirected).toBe(false);
    expect(await stored?.text()).toBe("the offline page");

    w.store.set("hourly-pages-v0", new Map());
    w.store.set("hourly-static-v0", new Map());
    w.store.set("somebody-elses-cache", new Map());
    await w.waitUntil("activate");
    expect([...w.store.keys()].sort()).toEqual(["hourly-static-v1", "somebody-elses-cache"]);
    expect(w.self.clients.claim).toHaveBeenCalled();
  });

  it("serves built files from the cache after the first time, without asking the network again", async () => {
    const w = loadWorker(async () => basic("console.log('chunk')"));
    const file = "/_next/static/chunks/app-1a2b3c.js";
    expect(await text(await w.request({ url: file }))).toBe("console.log('chunk')");
    expect(await text(await w.request({ url: file }))).toBe("console.log('chunk')");
    expect(w.fetchMock).toHaveBeenCalledTimes(1);
    // a failed file is not remembered
    const bad = loadWorker(async () => basic("gone", { status: 404 }));
    await bad.request({ url: "/_next/static/missing.js" });
    await bad.request({ url: "/_next/static/missing.js" });
    expect(bad.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("opens a page from the network when online, keeping a copy for later", async () => {
    const w = loadWorker(async () => basic("<main>Today, fresh</main>"));
    expect(await text(await w.request(page("/dashboard/today")))).toBe("<main>Today, fresh</main>");
    expect([...(w.store.get("hourly-pages-v1")?.keys() ?? [])]).toEqual([`${ORIGIN}/dashboard/today`]);
  });

  it("opens the kept copy of a page when there is no connection, and falls back to the same page without its query, then to the offline page", async () => {
    let online = true;
    const w = loadWorker(async (req) => {
      if (!online) throw new TypeError("Failed to fetch");
      return basic(`<main>${new URL(req.url).pathname} as last seen</main>`);
    });
    await w.waitUntil("install");
    await w.request(page("/dashboard/today"));
    await w.request(page("/dashboard/week?date=2026-10-19"));
    online = false;

    expect(await text(await w.request(page("/dashboard/week?date=2026-10-19")))).toBe(
      "<main>/dashboard/week as last seen</main>",
    );
    // opened before without the query: that copy stands in for this one
    online = true;
    await w.request(page("/dashboard/week"));
    online = false;
    expect(await text(await w.request(page("/dashboard/week?date=2026-10-12")))).toBe(
      "<main>/dashboard/week as last seen</main>",
    );
    // never opened at all: the offline page, never another page under this page's address
    expect(await text(await w.request(page("/dashboard/month")))).toBe("the offline page");

    // a worker with nothing kept at all shows the offline page
    const empty = loadWorker(async () => {
      throw new TypeError("Failed to fetch");
    });
    await empty.waitUntil("install");
    expect(await text(await empty.request(page("/dashboard/today")))).toBe("the offline page");
  });

  it("shows the kept copy when the network is very slow, instead of leaving the screen blank", async () => {
    let fast = true;
    const w = loadWorker(async () => {
      if (fast) return basic("<main>first visit</main>");
      return new Promise<Response>(() => undefined); // never answers
    });
    await w.request(page("/dashboard/today"));
    fast = false;
    expect(await text(await w.request(page("/dashboard/today")))).toBe("<main>first visit</main>");
  });

  it("never keeps an error page or a redirect to the log-in page", async () => {
    const down = loadWorker(async () => basic("server error", { status: 500 }));
    expect((await down.request(page("/dashboard/today")))?.status).toBe(500);
    expect(down.store.get("hourly-pages-v1")?.size ?? 0).toBe(0);

    const expired = loadWorker(async () => basic("<main>log in</main>", {}, true));
    await expired.request(page("/dashboard/today"));
    expect(expired.store.get("hourly-pages-v1")?.size ?? 0).toBe(0);
  });

  it("keeps the public guide in its own cache, whole, so it reads offline and survives signing out", async () => {
    let online = true;
    const w = loadWorker(async (req) => {
      if (!online) throw new TypeError("Failed to fetch");
      return basic(`<main>guide ${new URL(req.url).pathname}</main>`);
    });
    await w.waitUntil("install");

    // opening a guide page keeps it, in the guide's cache and not among the person's own pages
    await w.request(page("/help/offline"));
    expect([...(w.store.get("hourly-guide-v1")?.keys() ?? [])]).toEqual([`${ORIGIN}/help/offline`]);
    expect(w.store.get("hourly-pages-v1")?.size ?? 0).toBe(0);

    // the app's own once-only fetch of every guide page (a plain request carrying x-keep) keeps those too
    for (const path of ["/help", "/help/faq", "/help/rounding"]) await w.request({ url: path, keep: true });
    expect(w.store.get("hourly-guide-v1")?.size).toBe(4);

    // a page the person never opened still opens offline, and a topic opened with a query falls back to the plain page
    online = false;
    expect(await text(await w.request(page("/help/rounding")))).toBe("<main>guide /help/rounding</main>");
    expect(await text(await w.request(page("/help/faq")))).toBe("<main>guide /help/faq</main>");
    expect(await text(await w.request(page("/help?q=round")))).toBe("<main>guide /help</main>");
    // a topic that was never kept does not borrow another page: the offline page shows
    expect(await text(await w.request(page("/help/budgets")))).toBe("the offline page");

    // signing out clears the person's pages but not the public guide
    w.store.set("hourly-pages-v1", new Map([[`${ORIGIN}/dashboard/today`, basic("private")]]));
    await w.waitUntil("message", { data: "clear" });
    expect([...w.store.keys()].sort()).toEqual(["hourly-guide-v1", "hourly-static-v1"]);

    // an old version of the guide cache is removed on activation, the current one stays
    w.store.set("hourly-guide-v0", new Map());
    await w.waitUntil("activate");
    expect([...w.store.keys()].sort()).toEqual(["hourly-guide-v1", "hourly-static-v1"]);
  });

  it("leaves the guide's background requests alone: only a page opening or the app's own keep-fetch is answered", async () => {
    const w = loadWorker(async () => basic("x"));
    expect(await w.request({ url: "/help/rounding?_rsc=abc", mode: "cors" })).toBeUndefined();
    expect(await w.request({ url: "/help", mode: "navigate", method: "POST" })).toBeUndefined();
    expect(await w.request({ url: "/helpful-page", mode: "navigate" })).toBeUndefined();
  });

  it("leaves everything else alone: the API, sign-in, other pages, other sites and anything that is not a plain GET", async () => {
    const w = loadWorker(async () => basic("x"));
    expect(await w.request({ url: "/api/trpc/entry.list?batch=1", mode: "cors" })).toBeUndefined();
    expect(await w.request({ url: "/auth/v2/login", mode: "navigate" })).toBeUndefined();
    expect(await w.request({ url: "/", mode: "navigate" })).toBeUndefined();
    expect(await w.request({ url: "/invoice/some-private-token", mode: "navigate" })).toBeUndefined();
    expect(await w.request({ url: "/dashboard/today?_rsc=abc", mode: "cors" })).toBeUndefined(); // a background fetch, not a page open
    expect(await w.request({ url: "/dashboard/today", mode: "navigate", method: "POST" })).toBeUndefined();
    expect(await w.request({ url: "https://elsewhere.test/_next/static/a.js" })).toBeUndefined();
    expect(w.fetchMock).not.toHaveBeenCalled();
  });

  it("forgets the kept pages on the 'clear' message (sign-out) and keeps the built files and the offline page", async () => {
    const w = loadWorker(async () => basic("<main>my private day</main>"));
    await w.waitUntil("install");
    await w.request(page("/dashboard/today"));
    await w.request({ url: "/_next/static/a.js" });
    expect(w.store.has("hourly-pages-v1")).toBe(true);

    await w.waitUntil("message", { data: "clear" });
    expect(w.store.has("hourly-pages-v1")).toBe(false);
    expect(w.store.has("hourly-static-v1")).toBe(true);
    // any other message is ignored
    await w.waitUntil("message", { data: "something else" });
    expect(w.store.has("hourly-static-v1")).toBe(true);
  });
});
