import { describe, expect, it } from "vitest";

import { FEEDBACK_EMAIL, feedbackMailto } from "@/lib/feedback";

describe("integration feedback link", () => {
  it("opens an email to the admin with the subject and starter text filled in", () => {
    const url = new URL(feedbackMailto());
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe(FEEDBACK_EMAIL);
    expect(url.searchParams.get("subject")).toBe("UseHourly: what I'd like it to connect to");
    expect(url.searchParams.get("body")).toBe("I'd like UseHourly to connect to:\n\nI'd use it to:\n");
  });

  it("uses a different address when given one", () => {
    expect(feedbackMailto("me@example.com").startsWith("mailto:me@example.com?")).toBe(true);
  });
});
