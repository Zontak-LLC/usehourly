import { afterEach, describe, expect, it, vi } from "vitest";

import { escapeHtml, renderEmail, safeUrl } from "@/lib/email-template";
import {
  createMailer,
  resetPasswordMessage,
  teamInviteMessage,
  timesheetApprovedMessage,
  verifyEmailMessage,
} from "@/lib/mailer";
import { buildWeeklyReminder } from "@/lib/reminder";

/**
 * Every email is sent as styled HTML AND plain text. These journeys check what a reader gets in each, and what a
 * hostile name, note or link can and cannot do.
 */

const LINK = "https://usehourly.app/verify-email?token=abc_DEF-123";

describe("the real messages carry both parts and say the same thing", () => {
  it("confirm email: the link is a button in the HTML and a bare line in the text", () => {
    const m = verifyEmailMessage("ada@example.com", LINK);
    expect(m.subject).toBe("Confirm your email for UseHourly");
    expect(m.text).toBe(
      `Hi,\n\nPlease confirm this email address for your UseHourly account:\n\n${LINK}\n\nThe link works for 24 hours. If you did not create an account, you can ignore this message.\n\nUseHourly`,
    );
    expect(m.html).toContain(`href="${LINK}"`);
    expect(m.html).toContain("Confirm my email");
    expect(m.html).toContain("The link works for 24 hours");
    // a button can be blocked or stripped, so the address is also written out
    expect(m.html).toContain(`Or paste this link into your browser: ${LINK}`);
  });

  it("reset password: one-use wording is in both parts", () => {
    const m = resetPasswordMessage("ada@example.com", "https://usehourly.app/reset-password?token=t");
    for (const part of [m.text, m.html as string]) {
      expect(part).toContain("only once");
      expect(part).toContain("reset-password?token=t");
    }
  });

  it("Friday reminder: the week's rows, the total and the one-click stop link are in both parts", () => {
    const m = buildWeeklyReminder({
      name: "Jo Park",
      email: "jo@example.com",
      today: "2026-10-16",
      entries: [
        { date: "2026-10-12", minutes: 210, project: { name: "Site", client: { name: "Acme" } } },
        { date: "2026-10-13", minutes: 525, project: { name: "App", client: { name: "Beta" } } },
      ],
      appUrl: "https://usehourly.app",
      unsubscribeUrl: "https://usehourly.app/reminders/off?u=x&t=y",
      oneClickUrl: "https://usehourly.app/api/reminders/off?u=x&t=y",
    } as never);
    expect(m.text).toMatch(/Mon, Oct 12\s+3\.5 h/);
    expect(m.text).toContain("Turn it off with one click: https://usehourly.app/reminders/off?u=x&t=y");
    const html = m.html as string;
    expect(html).toContain("Hi Jo,");
    expect(html).toContain("Total: 12.25 h across 2 projects.");
    expect(html).toContain("Mon, Oct 12");
    expect(html).toContain('href="https://usehourly.app/reminders/off?u=x&amp;t=y"'); // & is escaped inside an attribute
    expect(html).toContain('href="https://usehourly.app/dashboard/week"');
    // the one-click unsubscribe headers are unchanged
    expect(m.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("timesheet approved: the note is quoted in both parts and the private link is in neither", () => {
    const m = timesheetApprovedMessage("ada@example.com", {
      approver: "Kirk Smith",
      title: "Acme · Oct 12 – Oct 18, 2026",
      note: "All good",
      link: "https://usehourly.app/dashboard/week",
    });
    expect(m.text).toContain('"All good"');
    expect(m.html).toContain("All good");
    expect(m.html).toContain("Kirk Smith approved the hours you shared:");
  });
});

describe("team invitation", () => {
  const base = {
    ownerEmail: "ada@example.com",
    link: "https://usehourly.app/team/join/tok_123",
    stopUrl: "https://usehourly.app/stop-emails?e=a&t=b",
    oneClickUrl: "https://usehourly.app/api/stop-emails?e=a&t=b",
    days: 7,
  };

  it("names who invited you, carries the link in both parts, and replies go to the inviter", () => {
    const m = teamInviteMessage("sam@example.com", { ...base, ownerName: "Ada Makes Sites" });
    expect(m.subject).toBe("Ada Makes Sites invited you to a team on UseHourly");
    expect(m.text).toContain("https://usehourly.app/team/join/tok_123");
    expect(m.html).toContain('href="https://usehourly.app/team/join/tok_123"');
    expect(m).toMatchObject({ replyTo: "ada@example.com", fromName: "Ada Makes Sites via UseHourly" });
    expect(m.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("a hostile inviter name cannot add markup or break the subject line", () => {
    const m = teamInviteMessage("sam@example.com", {
      ...base,
      ownerName: `<script>alert(1)</script>\r\nBcc: x@evil.test`,
    });
    expect(m.html).not.toContain("<script");
    expect(m.subject).not.toMatch(/[\r\n]/);
  });
});

describe("hostile text cannot become markup or a link", () => {
  const evil = `<img src=x onerror=alert(1)> "quoted" & <script>alert(2)</script>`;

  it("escapes names, titles and notes from strangers", () => {
    const m = timesheetApprovedMessage("ada@example.com", {
      approver: evil,
      title: `"><script>alert(3)</script>`,
      note: evil,
      link: "https://usehourly.app/dashboard/week",
    });
    const html = m.html as string;
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&quot;quoted&quot; &amp;");
    // the text part is text: nothing in it is ever interpreted, and the subject stays on one line
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  it("will not turn javascript:, data: or mailto: addresses into links", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<b>x</b>",
      "mailto:a@b.co",
      "not a url",
      "//evil.example",
    ]) {
      const { html } = renderEmail({ title: "t", greeting: "Hi,", blocks: [{ button: { label: "Go", url: bad } }] });
      expect(html, bad).not.toMatch(/href="(javascript|data|mailto):/i);
      expect(html, bad).not.toContain("<a href");
    }
    expect(safeUrl("https://usehourly.app/x?a=1&b=2")).toBe("https://usehourly.app/x?a=1&b=2");
    expect(safeUrl("http://localhost:3028/x")).toBe("http://localhost:3028/x");
    expect(safeUrl("ftp://x.example")).toBeNull();
  });

  it("escapes a quote that would otherwise close an attribute", () => {
    const { html } = renderEmail({
      title: "t",
      greeting: "Hi,",
      blocks: [{ button: { label: "Go", url: 'https://usehourly.app/x?q="onmouseover="alert(1)' } }],
    });
    expect(html).not.toContain('"onmouseover=');
    expect(escapeHtml(`a"b'c<d>&`)).toBe("a&quot;b&#39;c&lt;d&gt;&amp;");
  });
});

describe("what the HTML is made of", () => {
  const { html } = renderEmail({
    title: "Hello",
    greeting: "Hi,",
    blocks: ["A paragraph.", { rows: [["Mon", "1 h"]] }, { button: { label: "Open", url: LINK } }],
    footnote: { text: "Why you got this.", link: { label: "Stop", url: LINK } },
  });

  it("is one narrow column in the app's colours that also reads in dark mode", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain("max-width:560px");
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("#5a63d8"); // the accent button (v4 periwinkle)
  });

  it("loads nothing from anywhere else: no images, scripts, fonts or stylesheets", () => {
    expect(html).not.toMatch(/<img|<script|<link|<iframe|@import|url\(/i);
    expect(html).not.toMatch(/src=/i);
  });
});

describe("the mailer sends both parts", () => {
  afterEach(() => vi.unstubAllGlobals());
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "UseHourly <hi@example.com>" };

  it("posts text and html together, and only text when a message has no html", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body));
        return new Response("{}", { status: 200 });
      }),
    );
    const mailer = createMailer(env);
    await mailer?.send(verifyEmailMessage("ada@example.com", LINK));
    await mailer?.send({ to: "ada@example.com", subject: "Plain", text: "just text" });
    expect(bodies[0]).toMatchObject({ to: "ada@example.com", subject: "Confirm your email for UseHourly" });
    expect(typeof bodies[0].text).toBe("string");
    expect(String(bodies[0].html)).toContain("<!doctype html>");
    expect(bodies[1]).toEqual({ from: env.EMAIL_FROM, to: "ada@example.com", subject: "Plain", text: "just text" });
    expect("html" in bodies[1]).toBe(false);
  });
});
