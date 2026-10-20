import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearLocalCopy,
  getActiveEngine,
  LOCAL_FIRST_KEY,
  localFirstOn,
  setActiveEngine,
  setLocalFirst,
} from "@/lib/local-sync/active";
import { SyncEngine } from "@/lib/local-sync/engine";

import { fakeServer, memoryStore } from "./helpers/fake-sync-server";

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveEngine(null);
});

describe("the local-first switch", () => {
  it("is off until turned on, and remembers the choice in this browser", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(localFirstOn()).toBe(false);
    setLocalFirst(true);
    expect(localStorage.getItem(LOCAL_FIRST_KEY)).toBe("1");
    expect(localFirstOn()).toBe(true);
    setLocalFirst(false);
    expect(localFirstOn()).toBe(false);
  });

  it("stays off, without an error, when the browser blocks storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(localFirstOn()).toBe(false);
    expect(() => setLocalFirst(true)).not.toThrow();
  });

  it("logging out first sends what is waiting, then lets go of the engine", async () => {
    const server = fakeServer();
    const engine = new SyncEngine({ userId: "u1", store: memoryStore(), remote: server.remote });
    await engine.start();
    await engine.sync();
    setActiveEngine(engine);
    server.state.online = false;
    engine.create({ projectId: "p1", date: "2026-10-20", minutes: 20 });
    server.state.online = true;
    await clearLocalCopy();
    expect(server.entries.size).toBe(1); // it was sent on the way out
    expect(getActiveEngine()).toBeNull();
  });
});
