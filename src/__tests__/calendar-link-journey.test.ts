import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkCalendarLink, describeCalendarLink } from "@/lib/calendar-link";
import {
  addSkipped,
  calendarGeneration,
  cancelCalendarReads,
  forgetCalendar,
  loadLink,
  saveLink,
} from "@/lib/calendar-store";
import { fetchCalendarFeed, MAX_FEED_BYTES } from "@/server/calendar-feed";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ getPrisma: prismaMock }));

const GOOGLE = "https://calendar.google.com/calendar/ical/me%40example.com/private-abc123/basic.ics";
const ICS = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";

describe("which addresses may be read", () => {
  it("accepts the big calendar services, and turns webcal:// into https", () => {
    expect(checkCalendarLink(GOOGLE)).toEqual({ ok: true, url: GOOGLE });
    expect(checkCalendarLink(`  ${GOOGLE}  `)).toMatchObject({ ok: true });
    expect(checkCalendarLink("webcal://p12-caldav.icloud.com/published/2/abc")).toEqual({
      ok: true,
      url: "https://p12-caldav.icloud.com/published/2/abc",
    });
    expect(checkCalendarLink("https://outlook.office365.com/owa/calendar/x/y/calendar.ics")).toMatchObject({
      ok: true,
    });
    expect(checkCalendarLink("https://outlook.live.com/owa/calendar/x/y/calendar.ics")).toMatchObject({ ok: true });
  });

  it.each([
    ["", "Paste"],
    ["not a web address", "web address"],
    ["http://calendar.google.com/x.ics", "https"],
    ["ftp://calendar.google.com/x.ics", "https"],
    ["https://user:pw@calendar.google.com/x.ics", "private address"],
    ["https://calendar.google.com:8443/x.ics", "private address"],
    ["https://evil.example.com/x.ics", "Google, Outlook and iCloud"],
    ["https://calendar.google.com.evil.example.com/x.ics", "Google, Outlook and iCloud"],
    ["https://evilcalendar.google.com/x.ics", "Google, Outlook and iCloud"],
    ["https://p12-caldav.icloud.com.evil.com/x.ics", "Google, Outlook and iCloud"],
    ["https://127.0.0.1/x.ics", "Google, Outlook and iCloud"],
    ["https://localhost/x.ics", "Google, Outlook and iCloud"],
    ["https://169.254.169.254/latest/meta-data", "Google, Outlook and iCloud"],
    ["https://[::1]/x.ics", "Google, Outlook and iCloud"],
    [`https://calendar.google.com/${"a".repeat(2000)}`, "too long"],
  ])("refuses %s", (input, words) => {
    const r = checkCalendarLink(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(words);
  });

  it("names a saved address without showing its secret", () => {
    expect(describeCalendarLink(GOOGLE)).toBe("Google Calendar");
    expect(describeCalendarLink(GOOGLE)).not.toContain("private-abc123");
    expect(describeCalendarLink("https://outlook.live.com/a")).toBe("Outlook calendar");
    expect(describeCalendarLink("https://p3-caldav.icloud.com/a")).toBe("iCloud calendar");
  });
});

describe("fetching a feed for the browser", () => {
  const reply = (body: BodyInit | null, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

  it("returns the calendar text, asking without cookies and without following redirects itself", async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => reply(ICS));
    expect(await fetchCalendarFeed(GOOGLE, fetcher)).toEqual({ ok: true, text: ICS });
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(init.redirect).toBe("manual");
    expect(init.credentials).toBeUndefined();
  });

  it("never calls out for an address that fails the rules", async () => {
    const fetcher = vi.fn();
    const r = await fetchCalendarFeed("https://169.254.169.254/latest", fetcher);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("follows a redirect only while it stays on a calendar host", async () => {
    const next = "https://calendar.google.com/calendar/ical/moved.ics";
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: next } }))
      .mockResolvedValueOnce(reply(ICS));
    expect(await fetchCalendarFeed(GOOGLE, fetcher)).toMatchObject({ ok: true });
    expect(fetcher.mock.calls[1][0]).toBe(next);

    for (const where of ["http://169.254.169.254/latest", "https://evil.example.com/x.ics"]) {
      const f = vi.fn().mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: where } }));
      expect(await fetchCalendarFeed(GOOGLE, f)).toMatchObject({ ok: false, status: 502 });
      expect(f).toHaveBeenCalledTimes(1); // the second hop was never made
    }
  });

  it("gives up on a redirect loop", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: GOOGLE } }));
    expect(await fetchCalendarFeed(GOOGLE, fetcher)).toMatchObject({ ok: false, status: 502 });
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("explains a reset address and an upstream failure in plain words, without echoing the address", async () => {
    const gone = await fetchCalendarFeed(GOOGLE, async () => new Response("nope", { status: 404 }));
    expect(gone).toMatchObject({ ok: false, status: 403 });
    expect(JSON.stringify(gone)).toContain("reset");
    expect(JSON.stringify(gone)).not.toContain("private-abc123");
    const down = await fetchCalendarFeed(GOOGLE, async () => new Response("x", { status: 500 }));
    expect(down).toMatchObject({ ok: false, status: 502 });
    const offline = await fetchCalendarFeed(GOOGLE, async () => {
      throw new TypeError("fetch failed https://calendar.google.com/private-abc123");
    });
    expect(offline).toMatchObject({ ok: false, status: 502 });
    expect(JSON.stringify(offline)).not.toContain("private-abc123");
  });

  it("refuses a feed over the size limit, declared or streamed", async () => {
    const declared = await fetchCalendarFeed(GOOGLE, async () =>
      reply("x", { headers: { "content-length": String(MAX_FEED_BYTES + 1) } }),
    );
    expect(declared).toMatchObject({ ok: false, status: 413 });
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const streamed = await fetchCalendarFeed(GOOGLE, async () =>
      reply(
        new ReadableStream({
          pull(c) {
            if (sent++ > 20) c.close();
            else c.enqueue(chunk);
          },
        }),
      ),
    );
    expect(streamed).toMatchObject({ ok: false, status: 413 });
  });
});

describe("POST /api/calendar-feed", () => {
  let limiter = memoryRateLimit();
  const post = async (body: unknown, headers: Record<string, string> = {}) => {
    const { POST } = await import("@/app/api/calendar-feed/route");
    return POST(
      new Request("http://x/api/calendar-feed", {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  };

  beforeEach(() => {
    limiter = memoryRateLimit();
    prismaMock.mockResolvedValue({
      rateLimit: limiter.rateLimit,
      authUser: { findUnique: vi.fn(async () => ({ token_version: 2 })) },
    });
    authMock.mockResolvedValue({ user: { id: "u1", tv: 2 }, expires: "" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(ICS, { status: 200 })),
    );
  });

  it("hands the calendar text to a signed-in account, never cached", async () => {
    const res = await post({ url: GOOGLE });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(ICS);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toContain("text/calendar");
  });

  it("refuses a session from before a password change or log-out-everywhere, without fetching", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "u1", tv: 1 }, expires: "" });
    expect((await post({ url: GOOGLE })).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses signed-out callers and sample accounts without fetching anything", async () => {
    authMock.mockResolvedValueOnce(null);
    expect((await post({ url: GOOGLE })).status).toBe(401);
    authMock.mockResolvedValueOnce({ user: { id: "u1", tv: 2, demo: true }, expires: "" });
    expect((await post({ url: GOOGLE })).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses bad input and addresses that are not calendar hosts, without fetching", async () => {
    expect((await post("{broken")).status).toBe(400);
    expect((await post({ url: 5 })).status).toBe(400);
    expect((await post({ url: "x".repeat(3000) })).status).toBe(413);
    const res = await post({ url: "https://169.254.169.254/latest/meta-data" });
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows 30 reads an hour per account and then says to wait", async () => {
    for (let i = 0; i < 30; i++) expect((await post({ url: GOOGLE })).status).toBe(200);
    const res = await post({ url: GOOGLE });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: expect.stringContaining("Try again") });
    authMock.mockResolvedValue({ user: { id: "u2", tv: 2 }, expires: "" });
    expect((await post({ url: GOOGLE })).status).toBe(200); // another account has its own allowance
  });
});

describe("the connected address kept on this device", () => {
  const fake = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  };

  it("belongs to the account that connected it, and goes with the calendar", () => {
    const s = fake();
    expect(saveLink(s, "u1", GOOGLE)).toBe(true);
    expect(loadLink(s, "u1")).toBe(GOOGLE);
    expect(loadLink(s, "u2")).toBeNull();
    expect(loadLink(s, null)).toBeNull();
    saveLink(s, "u1", null);
    expect(loadLink(s, "u1")).toBeNull();
    saveLink(s, "u1", GOOGLE);
    addSkipped(s, "u1", "a@1");
    forgetCalendar(s);
    expect(loadLink(s, "u1")).toBeNull();
  });

  it("cancels reads still in flight when the calendar is removed, replaced or signed out", () => {
    const s = fake();
    const before = calendarGeneration();
    forgetCalendar(s);
    expect(calendarGeneration()).toBe(before + 1);
    cancelCalendarReads();
    expect(calendarGeneration()).toBe(before + 2);
  });

  it("survives damaged or blocked storage", () => {
    const s = fake();
    s.setItem("hourly:calendarLink", "not json");
    expect(loadLink(s, "u1")).toBeNull();
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadLink(blocked, "u1")).toBeNull();
    expect(saveLink(blocked, "u1", GOOGLE)).toBe(false);
  });
});
