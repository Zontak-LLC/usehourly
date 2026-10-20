import { describe, expect, it, vi } from "vitest";

import { SyncEngine } from "@/lib/local-sync/engine";
import { addOp } from "@/lib/local-sync/ops";
import type { Op } from "@/lib/local-sync/types";

import { fakeServer, memoryStore } from "./helpers/fake-sync-server";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function device(server: ReturnType<typeof fakeServer>, userId = "u1") {
  const store = memoryStore();
  let n = 0;
  const refused: string[] = [];
  const changes = vi.fn();
  const engine = new SyncEngine({
    userId,
    store,
    remote: server.remote,
    uuid: () => ID(100 + ++n + (userId === "u1" ? 0 : 500)),
    onChange: changes,
    onRefused: (m) => refused.push(m),
  });
  return { engine, store, refused, changes };
}
const MONDAY = { from: "2026-10-19", to: "2026-10-25" };
const titles = (d: { engine: SyncEngine }) => d.engine.list(MONDAY).map((e) => [e.id.slice(-3), e.minutes, e.note]);

describe("local-first entries: one person, two devices", () => {
  it("opens with a full copy, then answers every read from the device with no network", async () => {
    const server = fakeServer();
    server.direct.add({ id: "e1", minutes: 90, note: "design" });
    const phone = device(server);
    await phone.engine.start();
    expect(phone.engine.ready).toBe(false);
    await phone.engine.sync();
    expect(phone.engine.ready).toBe(true);

    server.state.online = false;
    server.state.calls.length = 0;
    const list = phone.engine.list(MONDAY);
    expect(list).toMatchObject([
      { id: "e1", minutes: 90, note: "design", non_billable: false, project: { name: "Site" } },
    ]);
    expect(server.state.calls).toEqual([]); // not one request
  });

  it("a new entry shows at once, is sent with its own id, and the server's copy replaces it without a flash", async () => {
    const server = fakeServer();
    const phone = device(server);
    await phone.engine.start();
    await phone.engine.sync();

    server.state.online = false;
    const made = phone.engine.create({ projectId: "p1", date: "2026-10-20", duration: "1:30", note: " homepage " });
    expect(made).toMatchObject({ minutes: 90, note: "homepage", project: { name: "Site" } });
    expect(phone.engine.list(MONDAY)).toHaveLength(1); // visible while offline
    expect(phone.engine.pending).toBe(1);
    await phone.engine.sync();
    expect(phone.engine.isOffline).toBe(true);
    expect(phone.engine.pending).toBe(1); // kept, not lost

    server.state.online = true;
    await phone.engine.sync();
    expect(phone.engine.pending).toBe(0);
    expect(server.entries.get(made.id)).toMatchObject({ minutes: 90, note: "homepage", user_id: "u1" });
    expect(phone.engine.list(MONDAY)).toHaveLength(1);
  });

  it("sending the same waiting entry twice (a lost reply, two tabs) saves it once", async () => {
    const server = fakeServer();
    const a = device(server);
    await a.engine.start();
    await a.engine.sync();
    server.state.online = false;
    const made = a.engine.create({ projectId: "p1", date: "2026-10-20", minutes: 30 });
    // a second tab starts from the same stored waiting list and sends first
    const b = new SyncEngine({ userId: "u1", store: a.store, remote: server.remote });
    await b.start();
    server.state.online = true;
    await Promise.all([a.engine.sync(), b.sync()]);
    expect([...server.entries.values()].filter((e) => e.id === made.id)).toHaveLength(1);
    expect(server.entries.size).toBe(1);
  });

  it("different fields edited on two devices both survive; the same field, the later push wins", async () => {
    const server = fakeServer();
    server.direct.add({ id: "e1", minutes: 60, note: "draft" });
    const phone = device(server);
    const laptop = device(server);
    for (const d of [phone, laptop]) {
      await d.engine.start();
      await d.engine.sync();
    }
    server.state.online = false; // both edit while apart
    phone.engine.update({ id: "e1", minutes: 120 });
    laptop.engine.update({ id: "e1", note: "final copy" });
    laptop.engine.update({ id: "e1", minutes: 45 });
    server.state.online = true;
    await phone.engine.sync(); // phone pushes first
    await laptop.engine.sync(); // laptop pushes later
    await phone.engine.sync();

    const saved = server.entries.get("e1");
    expect(saved).toMatchObject({ note: "final copy", minutes: 45 }); // note from laptop kept; minutes: later push wins
    expect(titles(phone)).toEqual(titles(laptop));
    expect(titles(phone)).toEqual([["e1".slice(-3), 45, "final copy"]]);
  });

  it("a delete on one device beats an edit on the other; the editor is told nothing scary and the entry is gone", async () => {
    const server = fakeServer();
    server.direct.add({ id: "e1" });
    const phone = device(server);
    const laptop = device(server);
    for (const d of [phone, laptop]) {
      await d.engine.start();
      await d.engine.sync();
    }
    server.state.online = false;
    phone.engine.delete({ id: "e1" });
    laptop.engine.update({ id: "e1", minutes: 200 });
    server.state.online = true;
    await phone.engine.sync();
    await laptop.engine.sync();
    expect(server.entries.has("e1")).toBe(false);
    expect(laptop.engine.list(MONDAY)).toEqual([]);
    expect(laptop.engine.pending).toBe(0);
    expect(laptop.refused).toEqual(["An entry you changed was deleted on another device."]);
    expect(phone.refused).toEqual([]);
  });

  it("an entry made and deleted while offline never reaches the server", async () => {
    const server = fakeServer();
    const phone = device(server);
    await phone.engine.start();
    await phone.engine.sync();
    server.state.online = false;
    const made = phone.engine.create({ projectId: "p1", date: "2026-10-20", minutes: 10 });
    phone.engine.update({ id: made.id, minutes: 20 });
    phone.engine.delete({ id: made.id });
    expect(phone.engine.pending).toBe(0);
    server.state.online = true;
    server.state.calls.length = 0;
    await phone.engine.sync();
    expect(server.state.calls.filter((c) => !c.startsWith("pull"))).toEqual([]);
  });

  it("entries changed elsewhere arrive on the next sync, deletes included", async () => {
    const server = fakeServer();
    server.direct.add({ id: "e1" });
    server.direct.add({ id: "e2" });
    const phone = device(server);
    await phone.engine.start();
    await phone.engine.sync();
    server.direct.edit("e1", { minutes: 15 });
    server.direct.remove("e2");
    server.direct.add({ id: "e3", minutes: 5 });
    server.direct.setNonBillable(["2026-10-20"]);
    phone.changes.mockClear();
    await phone.engine.sync();
    expect(phone.engine.list(MONDAY).map((e) => [e.id, e.minutes, e.non_billable])).toEqual(
      expect.arrayContaining([
        ["e1", 15, true],
        ["e3", 5, true],
      ]),
    );
    expect(phone.engine.list(MONDAY).some((e) => e.id === "e2")).toBe(false);
    expect(phone.changes).toHaveBeenCalled(); // the screens are told
    expect(phone.engine.nonBillableDays(MONDAY)).toEqual(["2026-10-20"]);
  });

  it("a change the server refuses disappears again and the person is told why", async () => {
    const server = fakeServer();
    const phone = device(server);
    await phone.engine.start();
    await phone.engine.sync();
    server.state.refuseCreates = "You have reached the limit of 50,000 entries.";
    phone.engine.create({ projectId: "p1", date: "2026-10-20", minutes: 30 });
    expect(phone.engine.list(MONDAY)).toHaveLength(1); // shown as saved at first
    await phone.engine.sync();
    expect(phone.engine.list(MONDAY)).toEqual([]);
    expect(phone.engine.pending).toBe(0);
    expect(phone.refused).toEqual(["You have reached the limit of 50,000 entries."]);
  });

  it("applies the server's rules on the device before anything is written", async () => {
    const server = fakeServer();
    const phone = device(server);
    await phone.engine.start();
    await phone.engine.sync();
    const bad = [
      () => phone.engine.create({ projectId: "p1", date: "2026-10-20", duration: "lots" }),
      () => phone.engine.create({ projectId: "p1", date: "10/20/2026", minutes: 30 }),
      () => phone.engine.create({ projectId: "nope", date: "2026-10-20", minutes: 30 }),
      () => phone.engine.create({ projectId: "p1", date: "2026-10-20", minutes: 24 * 60 + 1 }),
      () => phone.engine.update({ id: "missing", minutes: 5 }),
      () => phone.engine.delete({ id: "missing" }),
    ];
    for (const attempt of bad) expect(attempt).toThrow();
    expect(phone.engine.pending).toBe(0);
    expect(server.entries.size).toBe(0);
  });

  it("a full copy that arrives in pages misses nothing that changed while it was arriving", async () => {
    const server = fakeServer();
    for (const id of ["a1", "a2", "a3", "a4"]) server.direct.add({ id });
    server.state.pageSize = 2;
    let fired = false;
    server.state.afterPage = () => {
      if (fired) return;
      fired = true;
      server.direct.add({ id: "a0-late" }); // sorts before the pages still to come, so the paging itself would miss it
    };
    const phone = device(server);
    await phone.engine.start();
    await phone.engine.sync(); // full copy
    await phone.engine.sync(); // the next visit replays from before the first page
    expect(
      phone.engine
        .list(MONDAY)
        .map((e) => e.id)
        .sort(),
    ).toEqual(["a0-late", "a1", "a2", "a3", "a4"]);
  });

  it("making the same entry twice with one id (a retried form) waits once", async () => {
    const server = fakeServer();
    const phone = device(server);
    await phone.engine.start();
    await phone.engine.sync();
    server.state.online = false;
    const input = { projectId: "p1", date: "2026-10-20", minutes: 30, clientId: ID(7) };
    phone.engine.create(input);
    phone.engine.create(input);
    expect(phone.engine.pending).toBe(1);
    expect(phone.engine.list(MONDAY)).toHaveLength(1);
  });

  it("another account's copy is wiped, never shown", async () => {
    const server = fakeServer();
    server.direct.add({ id: "e1" });
    const first = device(server, "u1");
    await first.engine.start();
    await first.engine.sync();
    const intruder = new SyncEngine({ userId: "u2", store: first.store, remote: server.remote });
    await intruder.start();
    expect(intruder.ready).toBe(false);
    expect(intruder.list(MONDAY)).toEqual([]);
    expect(first.store.snapshot().entries).toEqual([]);
  });

  it("a reopened app has its entries and its waiting changes straight from the device", async () => {
    const server = fakeServer();
    server.direct.add({ id: "e1", note: "kept" });
    const before = device(server);
    await before.engine.start();
    await before.engine.sync();
    server.state.online = false;
    before.engine.create({ projectId: "p1", date: "2026-10-21", minutes: 25 });
    await new Promise((r) => setTimeout(r, 0)); // let the store write finish

    const after = new SyncEngine({ userId: "u1", store: before.store, remote: server.remote });
    await after.start();
    expect(after.ready).toBe(true);
    expect(after.pending).toBe(1);
    expect(
      after
        .list(MONDAY)
        .map((e) => e.minutes)
        .sort(),
    ).toEqual([25, 60]);
  });
});

describe("folding waiting changes together", () => {
  const create = (seq: number): Op => ({
    seq,
    kind: "create",
    entryId: "a",
    projectId: "p",
    date: "d",
    minutes: 10,
    note: "",
    createdAt: "t",
  });

  it("never alters the change that is being sent right now", () => {
    const sending = create(1);
    const ops = addOp([sending], { kind: "update", entryId: "a", patch: { minutes: 99 } }, 2, 1);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual(sending);
  });

  it("folds an edit into a creation and drops both on delete", () => {
    const edited = addOp([create(1)], { kind: "update", entryId: "a", patch: { minutes: 20 } }, 2, null);
    expect(edited).toMatchObject([{ kind: "create", minutes: 20 }]);
    expect(addOp(edited, { kind: "delete", entryId: "a" }, 3, null)).toEqual([]);
  });
});
