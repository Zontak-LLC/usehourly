import { createTRPCClient, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { describe, expect, it } from "vitest";

import { SyncEngine } from "@/lib/local-sync/engine";
import { localFirstLink } from "@/lib/local-sync/link";
import type { AppRouter } from "@/server/routers/_app";

import { fakeServer, memoryStore } from "./helpers/fake-sync-server";

const RANGE = { from: "2026-10-19", to: "2026-10-25" };

/** The client the app builds, with a recording stand-in where the HTTP link would be. */
function setup(engine: () => SyncEngine | null) {
  const wire: string[] = [];
  const terminal: TRPCLink<AppRouter> =
    () =>
    ({ op }) =>
      observable((observer) => {
        wire.push(`${op.type}:${op.path}`);
        observer.next({ result: { type: "data", data: op.type === "query" ? [] : { ok: true } } } as never);
        observer.complete();
      });
  return { wire, client: createTRPCClient<AppRouter>({ links: [localFirstLink({ engine }), terminal] }) };
}

async function readyEngine(server = fakeServer()) {
  const engine = new SyncEngine({ userId: "u1", store: memoryStore(), remote: server.remote });
  await engine.start();
  await engine.sync();
  return { engine, server };
}

describe("the local-first tRPC link", () => {
  it("answers entry reads and writes from the device and sends nothing over the wire", async () => {
    const { engine } = await readyEngine();
    const { client, wire } = setup(() => engine);
    const made = await client.entry.create.mutate({ projectId: "p1", date: "2026-10-20", duration: "2h", note: "x" });
    expect(made).toMatchObject({ minutes: 120, project: { name: "Site" } });
    expect(await client.entry.list.query(RANGE)).toHaveLength(1);
    await client.entry.update.mutate({ id: made.id, minutes: 30 });
    expect(await client.entry.list.query(RANGE)).toMatchObject([{ minutes: 30 }]);
    await client.entry.delete.mutate({ id: made.id });
    expect(await client.entry.list.query(RANGE)).toEqual([]);
    expect(await client.entry.nonBillableDays.query(RANGE)).toEqual([]);
    expect(wire).toEqual([]);
  });

  it("shows the server's own rule messages when the device refuses a change", async () => {
    const { engine } = await readyEngine();
    const { client } = setup(() => engine);
    await expect(
      client.entry.create.mutate({ projectId: "p1", date: "2026-10-20", duration: "lots" }),
    ).rejects.toMatchObject({
      message: "Couldn't read that duration. Try 1.5, 1:30 or 90m.",
    });
    await expect(client.entry.delete.mutate({ id: "missing" })).rejects.toMatchObject({ message: "Entry not found." });
  });

  it("passes everything through when there is no engine or no copy yet", async () => {
    const empty = new SyncEngine({ userId: "u1", store: memoryStore(), remote: fakeServer().remote });
    for (const engine of [null, empty]) {
      const { client, wire } = setup(() => engine);
      await client.entry.list.query(RANGE);
      await client.entry.create.mutate({ projectId: "p1", date: "2026-10-20", minutes: 5 });
      expect(wire).toEqual(["query:entry.list", "mutation:entry.create"]);
    }
  });

  it("leaves other calls to the server, and refreshes the copy before answering a change to projects", async () => {
    const { engine, server } = await readyEngine();
    const { client, wire } = setup(() => engine);
    expect(await client.entry.running.query()).toEqual([]);
    server.direct.add({ id: "made-elsewhere" }); // e.g. the AI assistant added time
    await client.entry.merge.mutate({ ids: ["a", "b"] });
    expect(wire).toEqual(["query:entry.running", "mutation:entry.merge"]);
    expect(engine.list(RANGE).map((e) => e.id)).toEqual(["made-elsewhere"]); // pulled before the answer arrived
  });
});
