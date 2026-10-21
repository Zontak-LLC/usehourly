import { describe, expect, it, vi } from "vitest";

import { loadGoogle, saveGoogle } from "@/lib/calendar-store";
import {
  eventsUrl,
  explainGoogleStatus,
  fetchGoogleEvents,
  GoogleCalendarError,
  googleEventsToCalendar,
  MAX_PAGES,
} from "@/lib/google-calendar";
import { googleCalendarClientId, googleCalendarClientIdFor } from "@/lib/google-calendar-config";

const ev = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  summary: "Planning",
  start: { dateTime: "2026-10-21T10:00:00-04:00" },
  end: { dateTime: "2026-10-21T10:45:00-04:00" },
  ...over,
});
const range = { from: new Date("2026-07-23T00:00:00Z"), to: new Date("2026-10-23T00:00:00Z") };

describe("meetings from Google Calendar", () => {
  it("keeps a timed meeting as a title and two instants", () => {
    const [e] = googleEventsToCalendar([ev()]);
    expect(e).toEqual({
      uid: "e1",
      title: "Planning",
      start: Date.parse("2026-10-21T10:00:00-04:00"),
      end: Date.parse("2026-10-21T10:45:00-04:00"),
    });
  });

  it("leaves out all-day, cancelled, free and declined events, like the file import", () => {
    const out = googleEventsToCalendar([
      ev({ id: "a", start: { date: "2026-10-21" }, end: { date: "2026-10-22" } }),
      ev({ id: "b", status: "cancelled" }),
      ev({ id: "c", transparency: "transparent" }),
      ev({ id: "d", attendees: [{ self: true, responseStatus: "declined" }] }),
      ev({ id: "keep1", attendees: [{ self: true, responseStatus: "accepted" }] }),
      ev({ id: "keep2", attendees: [{ responseStatus: "declined" }] }), // someone else declined
    ]);
    expect(out.map((e) => e.uid)).toEqual(["keep1", "keep2"]);
  });

  it("ignores items that are not events, events that end before they start, and cuts long or missing titles", () => {
    const out = googleEventsToCalendar([
      "junk",
      { nope: 1 },
      ev({ id: "x", end: { dateTime: "2026-10-21T09:00:00-04:00" } }),
      ev({ id: "long", summary: "z".repeat(500) }),
      ev({ id: "none", summary: undefined }),
    ]);
    expect(out.map((e) => e.uid)).toEqual(["long", "none"]);
    expect(out[0].title).toHaveLength(120);
    expect(out[1].title).toBe("(no title)");
  });
});

describe("asking Google", () => {
  it("asks for expanded repeats, only the fields it needs, in the window", () => {
    const u = new URL(eventsUrl(range, "tok"));
    expect(`${u.origin}${u.pathname}`).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(u.searchParams.get("singleEvents")).toBe("true");
    expect(u.searchParams.get("timeMin")).toBe(range.from.toISOString());
    expect(u.searchParams.get("timeMax")).toBe(range.to.toISOString());
    expect(u.searchParams.get("pageToken")).toBe("tok");
    expect(u.searchParams.get("fields")).not.toMatch(/description|location|organizer|attendees\(email/);
  });

  it("follows pages, sends the token only as a bearer header, and sorts", async () => {
    const calls: { url: string; auth: string | undefined }[] = [];
    const pages = [
      {
        items: [
          ev({ id: "late", start: { dateTime: "2026-10-21T15:00:00Z" }, end: { dateTime: "2026-10-21T16:00:00Z" } }),
        ],
        nextPageToken: "p2",
      },
      {
        items: [
          ev({ id: "early", start: { dateTime: "2026-10-21T08:00:00Z" }, end: { dateTime: "2026-10-21T09:00:00Z" } }),
        ],
      },
    ];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), auth: (init?.headers as Record<string, string> | undefined)?.authorization });
      return new Response(JSON.stringify(pages[calls.length - 1]), { status: 200 });
    }) as unknown as typeof fetch;
    const { events, truncated } = await fetchGoogleEvents("secret-token", range, fetcher);
    expect(events.map((e) => e.uid)).toEqual(["early", "late"]);
    expect(truncated).toBe(false);
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.auth === "Bearer secret-token" && !c.url.includes("secret-token"))).toBe(true);
    expect(calls[1].url).toContain("pageToken=p2");
  });

  it("stops after the page limit and says it was cut", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ items: [], nextPageToken: "more" })),
    ) as unknown as typeof fetch;
    const { truncated } = await fetchGoogleEvents("t", range, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(MAX_PAGES);
    expect(truncated).toBe(true);
  });

  it("turns refusals into plain sentences without Google's own text", async () => {
    const refuse = (status: number) =>
      vi.fn(async () => new Response("secret internal detail", { status })) as unknown as typeof fetch;
    await expect(fetchGoogleEvents("t", range, refuse(401))).rejects.toThrow(/sign-in ran out/);
    await expect(fetchGoogleEvents("t", range, refuse(403))).rejects.toThrow(/allowed reading/);
    await expect(fetchGoogleEvents("t", range, refuse(429))).rejects.toThrow(/too many requests/);
    const err = await fetchGoogleEvents("t", range, refuse(500)).catch((e) => e);
    expect(err).toBeInstanceOf(GoogleCalendarError);
    expect(String(err.message)).not.toContain("secret internal detail");
    expect(explainGoogleStatus(0)).toMatch(/Couldn't reach/);
    const down = vi.fn(async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    await expect(fetchGoogleEvents("t", range, down)).rejects.toThrow(/Couldn't reach/);
  });
});

describe("the connected flag and the switch", () => {
  it("is remembered per account only", () => {
    const store: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    };
    expect(loadGoogle(storage, "u1")).toBe(false);
    saveGoogle(storage, "u1", true);
    expect(loadGoogle(storage, "u1")).toBe(true);
    expect(loadGoogle(storage, "u2")).toBe(false);
    saveGoogle(storage, "u1", false);
    expect(loadGoogle(storage, "u1")).toBe(false);
  });

  it("the feature is on only for a real-looking Google client id", () => {
    const before = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    try {
      delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
      expect(googleCalendarClientId()).toBeNull();
      process.env.GOOGLE_CALENDAR_CLIENT_ID = "<script>.apps.googleusercontent.com";
      expect(googleCalendarClientId()).toBeNull();
      process.env.GOOGLE_CALENDAR_CLIENT_ID = "123-abc.apps.googleusercontent.com";
      expect(googleCalendarClientId()).toBe("123-abc.apps.googleusercontent.com");
    } finally {
      if (before === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
      else process.env.GOOGLE_CALENDAR_CLIENT_ID = before;
    }
  });
});

describe("who sees the Connect Google Calendar button", () => {
  const withEnv = (env: Record<string, string | undefined>, run: () => void) => {
    const before = { id: process.env.GOOGLE_CALENDAR_CLIENT_ID, pub: process.env.GOOGLE_CALENDAR_PUBLIC };
    try {
      for (const [k, v] of Object.entries(env)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      run();
    } finally {
      for (const [k, v] of [
        ["GOOGLE_CALENDAR_CLIENT_ID", before.id],
        ["GOOGLE_CALENDAR_PUBLIC", before.pub],
      ] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
  const ID = "123-abc.apps.googleusercontent.com";

  it("is for the owner only until Google has verified the app", () => {
    withEnv({ GOOGLE_CALENDAR_CLIENT_ID: ID, GOOGLE_CALENDAR_PUBLIC: undefined }, () => {
      expect(googleCalendarClientIdFor({ isAdmin: true, isDemo: false })).toBe(ID);
      expect(googleCalendarClientIdFor({ isAdmin: false, isDemo: false })).toBeNull();
    });
  });

  it("is for everyone once GOOGLE_CALENDAR_PUBLIC=1, except sample accounts", () => {
    withEnv({ GOOGLE_CALENDAR_CLIENT_ID: ID, GOOGLE_CALENDAR_PUBLIC: "1" }, () => {
      expect(googleCalendarClientIdFor({ isAdmin: false, isDemo: false })).toBe(ID);
      expect(googleCalendarClientIdFor({ isAdmin: true, isDemo: true })).toBeNull();
    });
  });

  it("is hidden for everyone while no client id is set", () => {
    withEnv({ GOOGLE_CALENDAR_CLIENT_ID: undefined, GOOGLE_CALENDAR_PUBLIC: "1" }, () => {
      expect(googleCalendarClientIdFor({ isAdmin: true, isDemo: false })).toBeNull();
    });
  });
});
