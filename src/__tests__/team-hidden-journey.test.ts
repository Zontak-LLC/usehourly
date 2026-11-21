import { describe, expect, it, vi } from "vitest";

import { feature } from "@/lib/features";

import { log, USERS, world } from "./helpers/team-world";

/**
 * Team is hidden in this release (real switches, no mock). Nobody can invite people, join a team or log time for an
 * owner by calling the server directly: every `team.*` and `member.*` call answers as if it did not exist, before it
 * reads or writes anything.
 */

type World = ReturnType<typeof world>;

const TOKEN = "t".repeat(43);
const TEAM = "m1";

/** Each team procedure with a valid input, called as a signed-in user. */
const CALLS: [string, (w: World) => Promise<unknown>][] = [
  ["team.list", (w) => w.as("ada").team.list()],
  ["team.invite", (w) => w.as("ada").team.invite({ email: USERS.sam.email, name: "Sam", clientIds: ["acme"] })],
  ["team.resend", (w) => w.as("ada").team.resend({ id: TEAM })],
  ["team.setClients", (w) => w.as("ada").team.setClients({ id: TEAM, clientIds: ["acme", "beta"] })],
  ["team.remove", (w) => w.as("ada").team.remove({ id: TEAM })],
  ["member.accept", (w) => w.as("sam").member.accept({ token: TOKEN })],
  ["member.teams", (w) => w.as("sam").member.teams()],
  ["member.log", (w) => w.as("sam").member.log(log({ teamId: TEAM }))],
  ["member.myEntries", (w) => w.as("sam").member.myEntries({ teamId: TEAM, from: "2026-10-01", to: "2026-10-31" })],
  ["member.deleteEntry", (w) => w.as("sam").member.deleteEntry({ teamId: TEAM, id: "own1" })],
  ["member.leave", (w) => w.as("sam").member.leave({ teamId: TEAM })],
];

/** Every mock on the fake database, by "model.method", with how often it was called. */
function databaseCalls(w: World): Record<string, number> {
  const calls: Record<string, number> = {};
  for (const [model, methods] of Object.entries(w.prisma)) {
    for (const [method, fn] of Object.entries(methods)) {
      if (vi.isMockFunction(fn)) calls[`${model}.${method}`] = fn.mock.calls.length;
    }
  }
  return calls;
}

describe("while team is hidden", () => {
  it("runs with the release's real switch", () => {
    expect(feature("team")).toBe(false);
  });

  it.each(CALLS)("%s answers not found and touches nothing", async (_name, call) => {
    const w = world();
    await expect(call(w)).rejects.toMatchObject({ code: "NOT_FOUND", message: "Not found." });
    const calls = databaseCalls(w);
    expect(Object.keys(calls)).toEqual(
      expect.arrayContaining(["teamMember.updateMany", "timeEntry.create", "rateLimit.upsert", "authUser.findUnique"]),
    );
    expect(Object.entries(calls).filter(([, count]) => count > 0)).toEqual([]);
    expect(w.members).toHaveLength(0);
    expect(w.sent).toHaveLength(0);
  });

  it("still asks a signed-out caller to sign in first", async () => {
    const w = world();
    await expect(w.as(null).team.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(w.as(null).member.teams()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(Object.entries(databaseCalls(w)).filter(([, count]) => count > 0)).toEqual([]);
  });
});
