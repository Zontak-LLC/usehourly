import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config.mjs";

describe("Permissions-Policy on every page", () => {
  it("lets only the site's own pages use the microphone, and keeps camera and location blocked", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const everyPage = rules.find((r) => r.source === "/(.*)");
    const policy = everyPage?.headers.find((h) => h.key === "Permissions-Policy")?.value;
    expect(policy).toBe("camera=(), microphone=(self), geolocation=()");

    const microphone = policy
      ?.split(",")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("microphone="));
    expect(microphone).toEqual(["microphone=(self)"]);
    expect(microphone?.[0]).not.toMatch(/\*|https?:|"/);
  });
});
