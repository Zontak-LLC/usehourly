import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The Android app only opens without a browser bar when this file names it and its signing key. */
describe("Android digital asset links", () => {
  const links = JSON.parse(readFileSync(join(process.cwd(), "public/.well-known/assetlinks.json"), "utf8"));
  const twa = JSON.parse(readFileSync(join(process.cwd(), "android/twa-manifest.json"), "utf8"));

  it("names the app package the Android project builds, with well-formed SHA-256 fingerprints", () => {
    expect(links).toHaveLength(1);
    expect(links[0].relation).toEqual(["delegate_permission/common.handle_all_urls"]);
    expect(links[0].target.namespace).toBe("android_app");
    expect(links[0].target.package_name).toBe(twa.packageId);
    expect(links[0].target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
    for (const fp of links[0].target.sha256_cert_fingerprints) expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it("points the app at this site and keeps the key out of the repo", () => {
    expect(twa.host).toBe("usehourly.app");
    expect(twa.startUrl).toBe("/dashboard/today");
    // Without the site-settings activity declared, the app crashes on launch (found on a Pixel).
    expect(twa.enableSiteSettingsShortcut).toBe(true);
    expect(twa.minSdkVersion).toBeGreaterThanOrEqual(24);
    expect(JSON.stringify(twa)).not.toMatch(/password/i);
  });
});
