import { describe, expect, it, vi } from "vitest";

import { OUTPUT_SCHEMAS } from "@/server/mcp/output-schemas";

import { outputChecked, setup, week, withWeek } from "./helpers/mcp-world";

// The share_timesheet tool itself, with sign-off switched on (the release hides it; mcp-journey checks it is gone).
// Tools are registered once when the module loads, so the switch has to be on before the import: a hoisted mock.
vi.mock("@/lib/features", async (orig) => (await import("./helpers/feature-switch")).withFeatures(orig, ["signOff"]));

describe("an assistant shares a timesheet for sign-off", () => {
  it("is offered, with honest hints and an output schema", async () => {
    const { tools } = (await setup().rpc("tools/list")).result as {
      tools: { name: string; annotations: Record<string, boolean> }[];
    };
    const names = tools.map((t) => t.name);
    expect(names).toContain("share_timesheet");
    expect(Object.keys(OUTPUT_SCHEMAS).sort()).toEqual([...names].sort());
    const share = tools.find((t) => t.name === "share_timesheet");
    expect(share?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  it("creates a private link for a client: the token is returned once and only its hash is stored", async () => {
    const s = await withWeek();
    const r = await s.call("share_timesheet", { ...week, client: "Acme", include_notes: false, expires_in_days: 7 });
    expect(r.isError).toBe(false);
    expect(outputChecked.has("share_timesheet")).toBe(true); // `call` matched it against OUTPUT_SCHEMAS
    const data = r.data as { url: string; includes_notes: boolean; expires_in_days: number };
    expect(data.url).toMatch(/\/timesheet\/[A-Za-z0-9_-]{20,}$/);
    expect(data).toMatchObject({ includes_notes: false, expires_in_days: 7 });
    const token = data.url.split("/").pop() ?? "";
    const stored = s.prisma.timesheetShare.create.mock.calls[0][0].data as {
      token_hash: string;
      user_id: string;
      snapshot: string;
    };
    expect(stored.user_id).toBe("u1");
    expect(stored.token_hash).not.toBe(token); // only a hash is kept
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.snapshot).not.toContain("review"); // notes left out when asked
    expect(s.prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: "u1", project: { client_id: "c1" } }), // Acme only
      }),
    );
  });

  it("is refused for a read-only token, for a bad lifetime, and when there is nothing to share", async () => {
    const ro = await withWeek("read");
    const refused = await ro.call("share_timesheet", week);
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("read-only");
    expect(ro.prisma.timesheetShare.create).not.toHaveBeenCalled();

    const s = await withWeek();
    expect((await s.call("share_timesheet", { ...week, expires_in_days: 10 })).isError).toBe(true);
    s.prisma.timeEntry.findMany.mockResolvedValue([]);
    const empty = await s.call("share_timesheet", week);
    expect(empty.isError).toBe(true);
    expect(empty.text).toContain("no logged time");
    expect(s.prisma.timesheetShare.create).not.toHaveBeenCalled();
  });

  it("offers a prompt that walks through building a client's timesheet and asks before sharing", async () => {
    const s = setup();
    const r = await s.rpc("prompts/get", {
      name: "client_timesheet",
      arguments: { client: "Acme", from: week.from, to: week.to },
    });
    const text = JSON.stringify(r.result);
    expect(text).toContain("get_timesheet");
    expect(text).toContain("share_timesheet");
    expect(text).toMatch(/confirm/i);
    const { prompts } = (await s.rpc("prompts/list")).result as { prompts: { name: string; description: string }[] };
    expect(prompts.find((p) => p.name === "client_timesheet")?.description).toContain("sign-off");
  });
});
