import { describe, expect, it } from "vitest";

import { feature } from "@/lib/features";
import { findShareByToken } from "@/server/timesheet-share";

import { nowS, range, seedShare, world } from "./helpers/timesheet-share-world";

/**
 * Sign-off links are hidden in this release (real switches, no mock). Nobody can make a new link by calling the
 * server directly, but a link a client already holds keeps working until it expires, so an approval in progress is
 * never cut off. The owner can still see and turn off the links they made.
 */

const TOKEN = "t".repeat(43);
const anon = (w: ReturnType<typeof world>) => w.as(null, { ip: "198.51.100.9" });

describe("while sign-off is hidden", () => {
  it("runs with the release's real switch", () => {
    expect(feature("signOff")).toBe(false);
  });

  it("refuses to make a new link, as not found, and touches nothing", async () => {
    const w = world();
    await expect(w.as("u1").timesheetShare.create({ ...range })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Not found.",
    });
    expect(w.prisma.timesheetShare.create).not.toHaveBeenCalled();
    expect(w.prisma.timesheetShare.count).not.toHaveBeenCalled();
    expect(w.prisma.timeEntry.findMany).not.toHaveBeenCalled();
    expect(w.shares).toHaveLength(0);
  });

  it("still asks a signed-out caller to sign in first", async () => {
    const w = world();
    await expect(w.as(null).timesheetShare.create({ ...range })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(w.prisma.timesheetShare.create).not.toHaveBeenCalled();
  });

  it("still opens a link that was already sent, and the client can approve it", async () => {
    const w = world();
    const row = await seedShare(w, TOKEN);
    expect((await findShareByToken(w.prisma as never, TOKEN))?.id).toBe(row.id);
    const out = await anon(w).timesheetShare.approve({ token: TOKEN, name: " Kirk Smith ", note: "Looks right" });
    expect(out.approvedAt).toBeGreaterThan(0);
    expect(w.shares[0]).toMatchObject({ approved_name: "Kirk Smith", approved_note: "Looks right" });
    expect(w.shares[0].approved_at).toBe(out.approvedAt);
  });

  it("still refuses an expired or a revoked link with the same words", async () => {
    const w = world();
    await seedShare(w, TOKEN, { expires_at: nowS() - 1 });
    await expect(anon(w).timesheetShare.approve({ token: TOKEN, name: "Kirk" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "This link isn't available any more.",
    });
    const revoked = "r".repeat(43);
    await seedShare(w, revoked, { revoked_at: nowS() - 60 });
    await expect(anon(w).timesheetShare.approve({ token: revoked, name: "Kirk" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "This link isn't available any more.",
    });
    expect(w.shares.map((s) => s.approved_at)).toEqual([null, null]);
  });

  it("still lists your own links and lets you turn one off", async () => {
    const w = world();
    const mine = await seedShare(w, TOKEN);
    await seedShare(w, "b".repeat(43), { user_id: "u2" });
    const listed = await w.as("u1").timesheetShare.list();
    expect(listed.map((s) => [s.id, s.status])).toEqual([[mine.id, "waiting"]]);
    expect(await w.as("u1").timesheetShare.revoke({ id: mine.id })).toEqual({ revoked: true });
    expect(w.shares[0].revoked_at).toBeGreaterThan(0);
    await expect(w.as("u2").timesheetShare.revoke({ id: mine.id })).rejects.toThrow(/not found/);
  });
});
