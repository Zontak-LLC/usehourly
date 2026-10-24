import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";
import { APP_SHORTCUTS, badgeOn, INSTALL_HELP_URL, installOffer, isAppleMobile } from "@/lib/install-app";
import { accessDecision } from "@/lib/route-access";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";

describe("a freelancer installs UseHourly on a phone (issue 70)", () => {
  it("the manifest offers long-press shortcuts to the everyday pages, each inside the app's scope", () => {
    const m = manifest();
    expect(m.shortcuts?.map((s) => s.name)).toEqual(["Log time", "This week", "This month", "Invoices"]);
    for (const s of m.shortcuts ?? []) {
      expect(s.url).toMatch(/^\/dashboard\/(today|week|month|invoices)$/);
      expect(s.url.startsWith(m.scope ?? "/")).toBe(true);
      expect(s.short_name?.length ?? 0).toBeLessThanOrEqual(12); // launchers cut longer labels
      expect(s.icons?.[0]?.src).toBe("/icons/icon-192.png");
      expect(accessDecision(s.url, true)).toBe("allow"); // signed in, the shortcut opens its page
      expect(accessDecision(s.url, false)).toBe("to-login"); // signed out, it asks to log in first
    }
    expect(m.shortcuts).toHaveLength(APP_SHORTCUTS.length);
    expect(m.start_url).toBe("/dashboard/today");
    expect(m.display).toBe("standalone");
  });

  it("Android Chrome with an install prompt gets one-tap install; an iPhone gets the Help steps", () => {
    expect(installOffer({ standalone: false, hasPrompt: true, userAgent: PIXEL })).toBe("prompt");
    expect(installOffer({ standalone: false, hasPrompt: false, userAgent: IPHONE })).toBe("help");
    // An iPad says it is a Mac; touch gives it away.
    expect(installOffer({ standalone: false, hasPrompt: false, userAgent: IPAD, maxTouchPoints: 5 })).toBe("help");
    expect(INSTALL_HELP_URL).toBe("/help?a=phone");
    expect(accessDecision("/help", false)).toBe("allow"); // the steps open even after signing out
  });

  it("nothing is offered once the app is installed, or where the browser cannot install", () => {
    expect(installOffer({ standalone: true, hasPrompt: true, userAgent: PIXEL })).toBeNull();
    expect(installOffer({ standalone: true, hasPrompt: false, userAgent: IPHONE })).toBeNull();
    expect(installOffer({ standalone: false, hasPrompt: false, userAgent: PIXEL })).toBeNull();
    expect(installOffer({ standalone: false, hasPrompt: false, userAgent: IPAD })).toBeNull(); // a real Mac
    expect(isAppleMobile(IPAD, 0)).toBe(false);
  });

  it("the icon badge shows only while a timer really runs", () => {
    expect(badgeOn({ started_at: "2026-10-23T09:00:00Z" })).toBe(true);
    expect(badgeOn({ started_at: new Date() })).toBe(true);
    expect(badgeOn({ started_at: null })).toBe(false); // a stopped entry
    expect(badgeOn(null)).toBe(false);
    expect(badgeOn(undefined)).toBe(false);
  });
});
