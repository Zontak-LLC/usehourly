import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The database client is built lazily on a Worker. A promise shared between requests made concurrent
 * first requests hang ("Worker's code had hung", Error 1101), so each request must build its own
 * until one finished client exists, and only the finished client may be reused.
 */

type Gate = { promise: Promise<void>; open: () => void };
const gate = (): Gate => {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
};

type Over = { contextGate?: () => Promise<void>; connect?: () => Promise<void>; failContextOnce?: boolean };
// The mocks are registered once (hoisted) and read this state, so concurrent dynamic imports inside getPrisma
// all resolve to the same mocked modules; only @/lib/prisma is re-imported to reset its cached client.
const ctl = vi.hoisted(() => ({
  over: {} as Over,
  made: [] as { id: number; connected: boolean }[],
  contexts: 0,
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    id = ctl.made.length;
    connected = false;
    constructor() {
      ctl.made.push(this);
    }
    async $connect() {
      await ctl.over.connect?.();
      this.connected = true;
    }
  },
}));
vi.mock("@prisma/adapter-d1", () => ({ PrismaD1: class {} }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => {
    ctl.contexts++;
    if (ctl.over.failContextOnce && ctl.contexts === 1) throw new Error("no binding yet");
    await ctl.over.contextGate?.();
    return { env: { DB: {} } };
  },
}));

async function load(over: Over) {
  vi.resetModules();
  ctl.over = over;
  ctl.made.length = 0;
  ctl.contexts = 0;
  // vitest can resolve concurrent first imports of a mocked module to the real one, so import them once here
  await import("@prisma/client");
  await import("@prisma/adapter-d1");
  await import("@opennextjs/cloudflare");
  const { getPrisma } = await import("@/lib/prisma");
  return { getPrisma, made: ctl.made, contexts: () => ctl.contexts };
}

describe("the lazy database client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("gives every concurrent first request its own build instead of one shared pending promise", async () => {
    const g = gate();
    const { getPrisma, made } = await load({ contextGate: () => g.promise });
    // one call per tick: vitest resolves same-tick dynamic imports of a mocked module to the real one
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const a = getPrisma();
    await tick();
    const b = getPrisma();
    await tick();
    const c = getPrisma();
    await tick();
    expect(a).not.toBe(b); // nothing is shared while the client is still being built
    expect(b).not.toBe(c);
    g.open();
    const [x, y, z] = await Promise.all([a, b, c]);
    // all three got a working client, and from then on everyone gets the same finished one
    expect(made.length).toBe(3);
    expect(x).toBe(y);
    expect(y).toBe(z);
    expect(await getPrisma()).toBe(x);
    expect(made.length).toBe(3); // no further builds once one is cached
  });

  it("only caches a client after it has been warmed up", async () => {
    const connectGate = gate();
    const { getPrisma, made } = await load({ connect: () => connectGate.promise });
    const first = getPrisma();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    // while the first client is still warming up, a second request must not be handed it half-ready
    const second = getPrisma();
    await new Promise((r) => setTimeout(r, 0));
    expect(made.length).toBe(2);
    expect(made.every((m) => !m.connected)).toBe(true);
    connectGate.open();
    const [a, b] = await Promise.all([first, second]);
    expect((a as unknown as { connected: boolean }).connected).toBe(true);
    expect(a).toBe(b);
  });

  it("builds only once on a warm Worker", async () => {
    const { getPrisma, made } = await load({});
    const first = await getPrisma();
    for (let i = 0; i < 5; i++) expect(await getPrisma()).toBe(first);
    expect(made.length).toBe(1);
  });

  it("does not cache a failure: the next request tries again", async () => {
    const { getPrisma, made } = await load({ failContextOnce: true });
    await expect(getPrisma()).rejects.toThrow("no binding yet");
    expect(made.length).toBe(0);
    const ok = await getPrisma();
    expect(ok).toBeDefined();
    expect(made.length).toBe(1);
  });

  it("still returns a client if the warm-up itself fails, and says so", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { getPrisma } = await load({
      connect: async () => {
        throw new Error("connect failed");
      },
    });
    expect(await getPrisma()).toBeDefined();
    expect(quiet).toHaveBeenCalledWith(expect.stringContaining("warm-up failed"), expect.any(Error));
    quiet.mockRestore();
  });
});
