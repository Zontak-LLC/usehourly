import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readAiKey, saveAiKey } from "@/lib/ai-key";
import { addPending, PENDING_KEY } from "@/lib/offline-queue";

// The hooks are thin wrappers over useSyncExternalStore: run it by hand so the subscribe / snapshot pair is exercised.
const hookCalls: { subscribe: (cb: () => void) => () => void; snapshot: () => unknown; server: () => unknown }[] = [];
vi.mock("react", () => ({
  useSyncExternalStore: (subscribe: () => () => void, snapshot: () => unknown, server: () => unknown) => {
    hookCalls.push({ subscribe: subscribe as never, snapshot, server });
    return snapshot();
  },
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m) } }));

const nextAuthSignOut = vi.fn(async (o?: unknown) => ({ signedOut: o }));
vi.mock("next-auth/react", () => ({ signOut: (o?: unknown) => nextAuthSignOut(o) }));

function fakeBrowser() {
  const store = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const win = {
    addEventListener: (t: string, cb: () => void) => {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)?.add(cb);
    },
    removeEventListener: (t: string, cb: () => void) => void listeners.get(t)?.delete(cb),
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", { onLine: true });
  return { store, listeners, localStorage };
}

const ENTRY = {
  clientId: "11111111-1111-4111-8111-111111111111",
  userId: "u1",
  projectId: "p1",
  date: "2026-10-19",
  minutes: 90,
  note: "",
  createdAt: 1,
};

beforeEach(() => {
  hookCalls.length = 0;
  toastError.mockClear();
  nextAuthSignOut.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("the offline helpers a person meets in the browser", () => {
  it("the waiting-entries hook follows the saved queue and hands out a stable list until it changes", async () => {
    const { localStorage, listeners } = fakeBrowser();
    const { usePendingEntries, notifyPending } = await import("@/lib/use-offline");

    expect(usePendingEntries()).toEqual([]);
    const call = hookCalls[0];
    const seen = vi.fn();
    const stop = call.subscribe(seen);
    expect(listeners.get("storage")?.size).toBe(1);

    addPending(localStorage, ENTRY);
    notifyPending();
    expect(seen).toHaveBeenCalledTimes(1);

    const first = call.snapshot() as { clientId: string; minutes: number }[];
    expect(first.map((e) => [e.clientId, e.minutes])).toEqual([[ENTRY.clientId, 90]]);
    expect(call.snapshot()).toBe(first); // same text, same array: no re-render loop
    expect(call.server()).toEqual([]);

    stop();
    expect(listeners.get("storage")?.size).toBe(0);
    notifyPending();
    expect(seen).toHaveBeenCalledTimes(1);

    localStorage.removeItem(PENDING_KEY);
    expect(call.snapshot()).toEqual([]);
  });

  it("the waiting-entries hook shows nothing when the device blocks storage", async () => {
    fakeBrowser();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    const { usePendingEntries } = await import("@/lib/use-offline");
    expect(usePendingEntries()).toEqual([]);
  });

  it("the online hook reads the browser's state and listens for it to change", async () => {
    const { listeners } = fakeBrowser();
    const { useOnline } = await import("@/lib/use-offline");

    expect(useOnline()).toBe(true);
    const call = hookCalls[0];
    const seen = vi.fn();
    const stop = call.subscribe(seen);
    expect([...listeners.keys()].sort()).toEqual(["offline", "online"]);

    vi.stubGlobal("navigator", { onLine: false });
    expect(call.snapshot()).toBe(false);
    expect(call.server()).toBe(true);

    stop();
    expect(listeners.get("online")?.size).toBe(0);
    expect(listeners.get("offline")?.size).toBe(0);
  });

  it("a failed action says 'no connection' when the network is down, and the real message otherwise", async () => {
    const { toastError: show } = await import("@/lib/toast-error");

    show(new TypeError("Failed to fetch"), "Could not save");
    expect(toastError).toHaveBeenLastCalledWith("No connection. That needs you to be online.");

    show(new Error("That project is archived."), "Could not save");
    expect(toastError).toHaveBeenLastCalledWith("That project is archived.");

    show("weird", "Could not save");
    expect(toastError).toHaveBeenLastCalledWith("Could not save");
  });

  it("signing out first stops saving and forgets the kept data; deleting the account also forgets waiting entries", async () => {
    const { localStorage } = fakeBrowser();
    const cacheStorage = { delete: vi.fn(async () => true), keys: vi.fn(async () => ["hourly-pages-v1"]) };
    vi.stubGlobal("caches", cacheStorage);
    const { signOutOfDevice } = await import("@/lib/sign-out");

    addPending(localStorage, ENTRY);
    saveAiKey(localStorage, "u1", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789");
    await expect(signOutOfDevice({ redirectTo: "/auth/v2/login" })).resolves.toEqual({
      signedOut: { redirectTo: "/auth/v2/login" },
    });
    expect(localStorage.getItem(PENDING_KEY)).not.toBeNull(); // typed but unsent entries survive a normal sign-out
    expect(readAiKey(localStorage, "u1")).toBeNull(); // the person's own AI key never stays on the device

    await signOutOfDevice({ redirectTo: "/" }, true);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(nextAuthSignOut).toHaveBeenCalledTimes(2);
  });
});
