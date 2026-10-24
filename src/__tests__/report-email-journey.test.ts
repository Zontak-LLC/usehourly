import { describe, expect, it, vi } from "vitest";

import { buildAnnualReport } from "@/lib/annual-report";
import type { MailMessage } from "@/lib/mailer";
import { annualReportMessage, MAX_LIST_ROWS, REPORT_EMAILS_PER_DAY } from "@/lib/report-mail";
import { yearFigures } from "@/lib/year-summary-rows";
import { yearReport } from "@/server/annual-report";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryNonBillableDays } from "./helpers/memory-non-billable";
import { memoryRateLimit } from "./helpers/memory-rate-limit";

const createCaller = createCallerFactory(appRouter);

/**
 * The year summary can be emailed to yourself ("Email me this" on /dashboard/report). Only ever to the account's own
 * confirmed address, recomputed on the server, and limited per day.
 */

type Owner = { email: string; email_verified_at: Date | null; email_bounced_at: Date | null; is_demo: boolean };
const goodOwner: Owner = {
  email: "jo@example.com",
  email_verified_at: new Date(),
  email_bounced_at: null,
  is_demo: false,
};

function world(over: { owner?: Partial<Owner>; mail?: "none" | "ok" | "fails"; account?: string } = {}) {
  const owner = { ...goodOwner, ...over.owner };
  const sent: MailMessage[] = [];
  const projects = [
    { id: "p1", name: "Site", hourly_rate: 10000, billable: true, client: { id: "c1", name: "Acme", currency: null } },
    {
      id: "p2",
      name: "Shop",
      hourly_rate: 8000,
      billable: true,
      client: { id: "c2", name: "Fern & <b>Co</b>", currency: "EUR" },
    },
  ];
  const entries = [
    { date: "2026-03-02", minutes: 60, project_id: "p1" },
    { date: "2026-03-03", minutes: 120, project_id: "p2" },
  ];
  const invoices = [
    {
      number: "I-1",
      client_name: "Acme",
      issue_date: "2026-03-31",
      paid_date: null,
      total_cents: 10000,
      total_minutes: 60,
      currency: "USD",
    },
    {
      number: "I-2",
      client_name: "Fern",
      issue_date: "2026-03-31",
      paid_date: "2026-04-05",
      total_cents: 16000,
      total_minutes: 120,
      currency: "EUR",
    },
  ];
  const limiter = memoryRateLimit();
  const prisma = {
    ...memoryNonBillableDays(),
    rateLimit: limiter.rateLimit,
    timeEntry: { findMany: vi.fn(async () => entries) },
    project: { findMany: vi.fn(async () => projects) },
    invoice: { findMany: vi.fn(async () => invoices) },
    authUser: {
      findUnique: vi.fn(async (a: { select?: Record<string, boolean> }) =>
        a.select && "email_verified_at" in a.select ? owner : { currency: over.account ?? "USD" },
      ),
    },
  };
  const mailer =
    over.mail === "none"
      ? null
      : {
          send: vi.fn(async (m: MailMessage) => {
            if (over.mail === "fails") throw new Error("resend said: key re_secret_123 is invalid");
            sent.push(m);
          }),
        };
  const ctx = {
    session: { user: { id: "u1" }, expires: "" },
    prisma: prisma as never,
    mailer,
    baseUrl: "https://app.test",
  };
  return {
    prisma,
    mailer,
    sent,
    caller: createCaller(ctx as never),
    signedOut: createCaller({ ...ctx, session: null } as never),
  };
}

describe("emailing the year summary to yourself", () => {
  it("sends the figures to the account's own address, in the account's currency by default", async () => {
    const w = world();
    expect(await w.caller.report.email({ year: 2026 })).toEqual({ to: "jo@example.com" });
    expect(w.sent).toHaveLength(1);
    const m = w.sent[0];
    expect(m.to).toBe("jo@example.com");
    expect(m.subject).toBe("Your 2026 year summary (USD)");
    expect(m.text).toContain("$100.00"); // Acme's one hour at $100: never mixed with the euro client
    expect(m.text).not.toContain("€");
    expect(m.text).toContain("Hours worked");
    expect(m.text).toContain("Q1");
    expect(m.text).toContain("https://app.test/dashboard/report?year=2026"); // the button opens the same year
    expect(m.html).toBeTruthy();
  });

  it("writes the other currency when it is picked, and escapes a client's name in the HTML", async () => {
    const w = world();
    await w.caller.report.email({ year: 2026, currency: "EUR" });
    const m = w.sent[0];
    expect(m.subject).toBe("Your 2026 year summary (EUR)");
    expect(m.text).toContain("€160.00");
    expect(m.text).not.toContain("$100.00");
    expect(m.text).toContain("Fern & <b>Co</b>"); // plain text as typed
    expect(m.html).toContain("Fern &amp; &lt;b&gt;Co&lt;/b&gt;"); // never as markup
    expect(m.html).not.toContain("<b>Co</b>");
  });

  it("can only ever go to the account's own address: no recipient can be passed in", async () => {
    const w = world();
    await w.caller.report.email({ year: 2026, to: "stranger@example.org" } as never);
    expect(w.sent.map((m) => m.to)).toEqual(["jo@example.com"]);
  });

  it("refuses a demo account, an unconfirmed address and a bounced one, and sends nothing", async () => {
    for (const [owner, words] of [
      [{ is_demo: true }, /Create a free account/],
      [{ email_verified_at: null }, /Confirm your email address first/],
      [{ email_bounced_at: new Date() }, /bounced/],
    ] as const) {
      const w = world({ owner });
      await expect(w.caller.report.email({ year: 2026 })).rejects.toThrow(words);
      expect(w.mailer?.send).not.toHaveBeenCalled();
      expect(w.prisma.timeEntry.findMany).not.toHaveBeenCalled();
    }
  });

  it("says plainly when email is not set up", async () => {
    const w = world({ mail: "none" });
    await expect(w.caller.report.email({ year: 2026 })).rejects.toThrow(/Email isn't set up/);
  });

  it("allows a few a day, then says how long to wait", async () => {
    const w = world();
    for (let i = 0; i < REPORT_EMAILS_PER_DAY; i++) await w.caller.report.email({ year: 2026 });
    await expect(w.caller.report.email({ year: 2026 })).rejects.toThrow(/Try again in/);
    expect(w.sent).toHaveLength(REPORT_EMAILS_PER_DAY);
  });

  it("never shows the email service's own error text", async () => {
    const w = world({ mail: "fails" });
    const err = await w.caller.report.email({ year: 2026 }).catch((e: Error) => e);
    expect((err as Error).message).toBe("Couldn't send the email right now. Please try again in a minute.");
    expect((err as Error).message).not.toContain("re_secret");
  });

  it("refuses a signed-out caller and a nonsense year before touching anything", async () => {
    const w = world();
    await expect(w.signedOut.report.email({ year: 2026 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(w.caller.report.email({ year: 1850 })).rejects.toThrow();
    await expect(w.caller.report.email({ year: 2026, currency: "XYZ" as never })).rejects.toThrow();
    expect(w.mailer?.send).not.toHaveBeenCalled();
    expect(w.prisma.timeEntry.findMany).not.toHaveBeenCalled();
  });
});

describe("the email looks like the Year summary page (issue 174)", () => {
  it("carries the page's own figures, in both parts, computed by the same yearReport", async () => {
    const w = world();
    await w.caller.report.email({ year: 2026 });
    const m = w.sent[0];
    const page = await yearReport(w.prisma as never, "u1", { year: 2026 });
    const money = (c: number) => `$${(c / 100).toFixed(2)}`;
    for (const f of yearFigures(page, money)) {
      expect(m.text).toContain(`  ${f.label.padEnd(15)} ${f.value}  (${f.hint})`);
      expect(m.html).toContain(f.value);
    }
    expect(m.text).toMatch(/Hours worked\s+1:00\s+\(1 day\)/); // h:mm, as on the page
    expect(m.text).toMatch(/Unpaid\s+\$100\.00\s+\(1 invoice not paid at year end\)/);
    // By quarter as a table with the page's dash for empty figures and the total row
    expect(m.text).toMatch(/Q1 · Jan–Mar\s+1:00\s+1:00\s+\$100\.00\s+–/);
    expect(m.text).toMatch(/Q2 · Apr–Jun\s+–\s+–\s+–\s+–/);
    expect(m.text).toMatch(/Total\s+1:00\s+1:00\s+\$100\.00\s+\$0\.00/);
    // By month: only months with activity
    expect(m.text).toContain("Only months with activity are shown.");
    expect(m.text).toMatch(/March\s+1:00/);
    expect(m.text).not.toMatch(/January|February|December/);
    // client then its project with the rate; then the invoices
    expect(m.text).toMatch(/Acme\s+1:00\s+\$100\.00\n {4}Site\s+\$100\.00\/h\s+1:00\s+\$100\.00/);
    expect(m.text).toMatch(/I-1\s+Acme\s+Mar 31, 2026\s+\$100\.00\s+Unpaid/);
    expect(m.html).toContain("Open the Year summary");
    expect(m.html).toContain('href="https://app.test/dashboard/report?year=2026"');
  });

  it("cuts a long list at the first rows and says how many more are on the site", () => {
    const invoices = Array.from({ length: MAX_LIST_ROWS + 7 }, (_, i) => ({
      number: `INV-2026-${String(i + 1).padStart(3, "0")}`,
      client_name: "Acme",
      issue_date: "2026-05-01",
      paid_date: null,
      total_cents: 1000,
      total_minutes: 60,
    }));
    const report = buildAnnualReport({ year: 2026, entries: [], projects: [], invoices });
    const m = annualReportMessage("jo@example.com", {
      year: 2026,
      currency: "USD",
      report,
      link: "https://app.test/dashboard/report?year=2026",
    });
    expect(m.text).toContain(`INV-2026-${String(MAX_LIST_ROWS).padStart(3, "0")}`);
    expect(m.text).not.toContain(`INV-2026-${String(MAX_LIST_ROWS + 1).padStart(3, "0")}`);
    expect(m.text).toContain("7 more on the site.");
    expect(m.html).toContain("See them all on the Year summary");
    // the total still counts every invoice, as the page does
    expect(m.text).toMatch(/Total\s+\$320\.00/);
    // nothing happened in any month, so the month table is left out
    expect(m.text).not.toContain("By month");
  });
});
