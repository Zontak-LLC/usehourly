import { describe, expect, it, vi } from "vitest";

import { accessDecision } from "@/lib/route-access";
import { buildShareSnapshot, shareStatus } from "@/lib/timesheet-share";
import { parseSnapshot } from "@/server/schemas/timesheet-share";
import { findShareByToken } from "@/server/timesheet-share";

import { nowS, range, type Share, world } from "./helpers/timesheet-share-world";

// These journeys are the sign-off feature itself, so they run with it switched on (the release hides it).
vi.mock("@/lib/features", async (orig) => (await import("./helpers/feature-switch")).withFeatures(orig, ["signOff"]));

describe("making a link for a client", () => {
  it("freezes the hours, leaves out running and empty entries, and shows no money", async () => {
    const w = world();
    const { id, token } = await w.as("u1").timesheetShare.create({ ...range });
    const row = w.shares.find((s) => s.id === id) as Share;
    const snap = parseSnapshot(row.snapshot) as NonNullable<ReturnType<typeof parseSnapshot>>;
    expect(snap.owner).toBe("Ada Makes Sites");
    expect(snap.days).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(snap.total).toBe(120 + 90 + 60 + 45); // not the 30-minute running timer, the 0-minute row, or November
    expect(snap.rows.map((r) => `${r.client}/${r.project}:${r.total}`)).toEqual([
      "Acme/App:60",
      "Acme/Website:210",
      "Beta/Docs:45",
    ]);
    expect(snap.title).toBe(`All clients · ${"Oct 12 – Oct 18, 2026 · 7 days"}`);
    // the page is about hours: nothing that looks like a rate or an amount is stored
    expect(row.snapshot).not.toMatch(/rate|amount|price|9999|billable/i);
    // another account's hours never appear
    expect(row.snapshot).not.toContain("SOMEONE ELSE");
    expect(token.length).toBeGreaterThan(30);
  });

  it("stores only a hash of the link, and returns the link once", async () => {
    const w = world();
    const { token } = await w.as("u1").timesheetShare.create({ ...range });
    const row = w.shares[0];
    expect(row.token_hash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.token_prefix).toBe(token.slice(0, 6));
    const listed = await w.as("u1").timesheetShare.list();
    expect(JSON.stringify(listed)).not.toContain(token);
    expect(JSON.stringify(listed)).not.toContain("snapshot");
  });

  it("can be limited to one client or one project, and can leave the descriptions out", async () => {
    const w = world();
    await w.as("u1").timesheetShare.create({ ...range, clientId: "acme" });
    expect(parseSnapshot(w.shares[0].snapshot)?.rows.map((r) => r.client)).toEqual(["Acme", "Acme"]);
    expect(w.shares[0].title.startsWith("Acme · ")).toBe(true);
    await w.as("u1").timesheetShare.create({ ...range, projectId: "p3", includeNotes: false });
    const only = parseSnapshot(w.shares[1].snapshot);
    expect(only?.rows).toHaveLength(1);
    expect(only?.notes).toBeNull();
    expect(w.shares[1].snapshot).not.toContain("README");
    await w.as("u1").timesheetShare.create({ ...range, projectId: "p3", includeNotes: true });
    expect(parseSnapshot(w.shares[2].snapshot)?.notes).toEqual([
      { date: "2026-10-14", client: "Beta", project: "Docs", minutes: 45, note: "Wrote the README" },
    ]);
  });

  it("will not share another account's project even if its id is guessed", async () => {
    const w = world();
    await expect(w.as("u2").timesheetShare.create({ ...range, projectId: "p3" })).rejects.toThrow(/no logged time/);
    expect(w.shares).toHaveLength(0);
  });

  it("refuses empty ranges, huge ranges, bad lifetimes, sample accounts and strangers, creating nothing", async () => {
    const w = world();
    await expect(w.as("u1").timesheetShare.create({ from: "2026-12-01", to: "2026-12-07" })).rejects.toThrow(
      /no logged time/,
    );
    await expect(w.as("u1").timesheetShare.create({ from: "2025-01-01", to: "2026-12-31" })).rejects.toThrow(
      /up to a year/,
    );
    await expect(
      w.as("u1").timesheetShare.create({ ...range, from: "2026-10-18", to: "2026-10-12" }),
    ).rejects.toThrow();
    await expect(w.as("u1").timesheetShare.create({ ...range, expiresInDays: 365 })).rejects.toThrow(/7, 30 or 90/);
    await expect(w.as("u1", { demo: true }).timesheetShare.create({ ...range })).rejects.toThrow(/free account/);
    await expect(w.as(null).timesheetShare.create({ ...range })).rejects.toThrow();
    expect(w.shares).toHaveLength(0);
  });

  it("stops at 50 live links", async () => {
    const w = world();
    for (let i = 0; i < 50; i++) await w.as("u1").timesheetShare.create({ ...range });
    await expect(w.as("u1").timesheetShare.create({ ...range })).rejects.toThrow(/50 live/);
    expect(w.shares).toHaveLength(50);
    // revoking one frees a place
    await w.as("u1").timesheetShare.revoke({ id: w.shares[0].id });
    await w.as("u1").timesheetShare.create({ ...range });
    expect(w.shares).toHaveLength(51);
  });
});

describe("your links", () => {
  it("shows only your own, with their state", async () => {
    const w = world();
    await w.as("u1").timesheetShare.create({ ...range });
    await w.as("u2").timesheetShare.create({ from: "2026-10-12", to: "2026-10-12" });
    const mine = await w.as("u1").timesheetShare.list();
    expect(mine).toHaveLength(1);
    expect(mine[0].status).toBe("waiting");
    w.shares[0].approved_at = nowS();
    w.shares[0].approved_name = "Kirk";
    expect((await w.as("u1").timesheetShare.list())[0]).toMatchObject({ status: "approved", approved_name: "Kirk" });
  });

  it("lets you turn off your own link only", async () => {
    const w = world();
    const { id } = await w.as("u1").timesheetShare.create({ ...range });
    await expect(w.as("u2").timesheetShare.revoke({ id })).rejects.toThrow(/not found/);
    expect(w.shares[0].revoked_at).toBeNull();
    await w.as("u1").timesheetShare.revoke({ id });
    expect(w.shares[0].revoked_at).not.toBeNull();
    await expect(w.as("u1").timesheetShare.revoke({ id })).rejects.toThrow(/not found/);
  });
});

describe("the client approves", () => {
  const make = async () => {
    const w = world();
    const { token } = await w.as("u1").timesheetShare.create({ ...range });
    return { w, token, anon: (ip = "198.51.100.9") => w.as(null, { ip }) };
  };

  it("records the name, note and time, once", async () => {
    const { w, token, anon } = await make();
    const out = await anon().timesheetShare.approve({ token, name: "  Kirk Smith ", note: " Looks right " });
    expect(out.approvedAt).toBeGreaterThan(0);
    expect(w.shares[0]).toMatchObject({ approved_name: "Kirk Smith", approved_note: "Looks right" });
    await expect(anon().timesheetShare.approve({ token, name: "Someone Else" })).rejects.toThrow(
      /already been approved/,
    );
    expect(w.shares[0].approved_name).toBe("Kirk Smith");
  });

  it("lets only one of two simultaneous approvals win", async () => {
    const { w, token, anon } = await make();
    // Force the overlap: both requests read the link as "waiting" before either one writes, so only the
    // conditional update in approve() can stop the second.
    const realFind = w.prisma.timesheetShare.findUnique.getMockImplementation() as (a: never) => Promise<Share | null>;
    let arrived = 0;
    let release: () => void = () => undefined;
    const bothRead = new Promise<void>((r) => {
      release = r;
    });
    w.prisma.timesheetShare.findUnique.mockImplementation((async (args: never) => {
      const row = await realFind(args);
      const copy = row ? { ...row } : row;
      if (++arrived === 2) release();
      await bothRead;
      return copy;
    }) as never);
    const results = await Promise.allSettled([
      anon("198.51.100.1").timesheetShare.approve({ token, name: "First" }),
      anon("198.51.100.2").timesheetShare.approve({ token, name: "Second" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(["First", "Second"]).toContain(w.shares[0].approved_name);
  });

  it("does nothing for a wrong, revoked or expired link, and says the same thing each time", async () => {
    const { w, token, anon } = await make();
    await expect(anon().timesheetShare.approve({ token: "x".repeat(43), name: "Kirk" })).rejects.toThrow(
      /isn't available/,
    );
    w.shares[0].revoked_at = nowS();
    await expect(anon().timesheetShare.approve({ token, name: "Kirk" })).rejects.toThrow(/isn't available/);
    w.shares[0].revoked_at = null;
    w.shares[0].expires_at = nowS() - 1;
    await expect(anon().timesheetShare.approve({ token, name: "Kirk" })).rejects.toThrow(/isn't available/);
    expect(w.shares[0].approved_at).toBeNull();
  });

  it("needs a name and rejects oversized input", async () => {
    const { w, token, anon } = await make();
    await expect(anon().timesheetShare.approve({ token, name: "   " })).rejects.toThrow();
    await expect(anon().timesheetShare.approve({ token, name: "K".repeat(81) })).rejects.toThrow();
    await expect(anon().timesheetShare.approve({ token, name: "Kirk", note: "n".repeat(501) })).rejects.toThrow();
    expect(w.shares[0].approved_at).toBeNull();
  });

  it("stops a guesser after a few tries on one link", async () => {
    const { token, anon } = await make();
    for (let i = 0; i < 5; i++)
      await expect(anon(`198.51.100.${i}`).timesheetShare.approve({ token, name: "   " })).rejects.toThrow();
    for (let i = 0; i < 5; i++)
      await anon(`198.51.101.${i}`)
        .timesheetShare.approve({ token, name: "Kirk" })
        .catch(() => undefined);
    await expect(anon("198.51.102.1").timesheetShare.approve({ token, name: "Kirk" })).rejects.toThrow(
      /Too many tries/,
    );
  });
});

describe("the owner is told when a client approves", () => {
  const make = async () => {
    const w = world();
    const { token } = await w.as("u1").timesheetShare.create({ ...range });
    return { w, token, anon: () => w.as(null, { ip: "198.51.100.9" }) };
  };

  it("emails the owner once, with the name, the sheet and a link to their shared timesheets", async () => {
    const { w, token, anon } = await make();
    await anon().timesheetShare.approve({ token, name: "Kirk Smith", note: "All good, thanks" });
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0].to).toBe("ada@example.com");
    expect(w.sent[0].subject).toBe("Kirk Smith approved your timesheet");
    expect(w.sent[0].text).toContain("All clients");
    expect(w.sent[0].text).toContain("All good, thanks");
    expect(w.sent[0].text).toContain("https://usehourly.app/dashboard/week");
    expect(w.sent[0].text).not.toContain(token); // the private link itself is never in the email
    // a second attempt is refused and sends nothing more
    await expect(anon().timesheetShare.approve({ token, name: "Kirk Smith" })).rejects.toThrow();
    expect(w.sent).toHaveLength(1);
  });

  it("cleans a stranger's name so it cannot break the subject line", async () => {
    const { w, token, anon } = await make();
    await anon().timesheetShare.approve({ token, name: "Kirk\r\nBcc: evil@example.com\u2028 Smith" });
    expect(w.sent[0].subject).not.toMatch(/[\r\n\u2028]/);
    expect(w.sent[0].subject).toBe("Kirk Bcc: evil@example.com Smith approved your timesheet");
  });

  it("does not email an address the owner never confirmed, one that bounced, or a sample account", async () => {
    const { w, token, anon } = await make();
    w.users.u1.email_verified_at = null;
    await anon().timesheetShare.approve({ token, name: "Kirk" });
    expect(w.sent).toHaveLength(0);

    const b = await make();
    b.w.users.u1.email_bounced_at = new Date();
    await b.anon().timesheetShare.approve({ token: b.token, name: "Kirk" });
    expect(b.w.sent).toHaveLength(0);

    const c = await make();
    c.w.users.u1.is_demo = true;
    await c.anon().timesheetShare.approve({ token: c.token, name: "Kirk" });
    expect(c.w.sent).toHaveLength(0);
  });

  it("still records the approval when email is not set up or the email service fails", async () => {
    const a = await make();
    a.w.mailer.off();
    await a.anon().timesheetShare.approve({ token: a.token, name: "Kirk" });
    expect(a.w.shares[0].approved_name).toBe("Kirk");

    const b = await make();
    b.w.mailer.failing();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await b.anon().timesheetShare.approve({ token: b.token, name: "Kirk" });
    expect(b.w.shares[0].approved_name).toBe("Kirk");
    expect(JSON.parse(String(quiet.mock.calls[0][0]))).toMatchObject({
      level: "error",
      event: "approval_email_failed",
      error: { message: "the email service is down" },
    });
    quiet.mockRestore();
  });
});

describe("rules behind the page", () => {
  it("reads a link's state, with approval winning", () => {
    const base = { revoked_at: null, approved_at: null, expires_at: 2000 };
    expect(shareStatus(base, 1000)).toBe("waiting");
    expect(shareStatus(base, 2000)).toBe("expired");
    expect(shareStatus({ ...base, revoked_at: 5 }, 1000)).toBe("revoked");
    expect(shareStatus({ ...base, approved_at: 5, revoked_at: 6 }, 3000)).toBe("approved");
  });

  it("rejects stored text that is not a snapshot instead of throwing", () => {
    expect(parseSnapshot("not json")).toBeNull();
    expect(parseSnapshot('{"version":2}')).toBeNull();
    expect(parseSnapshot("null")).toBeNull();
  });

  it("builds a snapshot with its totals adding up", () => {
    const snap = buildShareSnapshot({
      owner: "O",
      title: "T",
      from: "2026-10-12",
      to: "2026-10-13",
      entries: [],
      includeNotes: true,
    });
    expect(snap).toMatchObject({ total: 0, days: [], rows: [], notes: [] });
  });

  it("finds a link by its token and never by anything shorter", async () => {
    const w = world();
    const { token } = await w.as("u1").timesheetShare.create({ ...range });
    expect((await findShareByToken(w.prisma as never, token))?.id).toBe(w.shares[0].id);
    expect(await findShareByToken(w.prisma as never, "short")).toBeNull();
    expect(await findShareByToken(w.prisma as never, "y".repeat(43))).toBeNull();
    expect(await findShareByToken(w.prisma as never, "z".repeat(200))).toBeNull();
  });

  it("opens the shared page to anyone, signed in or not", () => {
    expect(accessDecision("/timesheet/abcDEF123", false)).toBe("allow");
    expect(accessDecision("/timesheet/abcDEF123", true)).toBe("allow");
    expect(accessDecision("/dashboard/week", false)).toBe("to-login");
  });
});
