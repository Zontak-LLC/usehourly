import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The database client is built lazily on a Worker, once per REQUEST (issue 315): anything shared between requests
 * can make one of them hang ("Worker's code had hung", Error 1101). The real-Prisma scenario is in
 * prisma-per-request-journey.test.ts; these check the build rules with a stand-in client.
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
type Ctx = { env: { DB: object } };
// The mocks are registered once (hoisted) and read this state, so concurrent dynamic imports inside getPrisma
// all resolve to the same mocked modules; only @/lib/prisma is re-imported to reset its cached client.
const ctl = vi.hoisted(() => ({
  over: {} as Over,
  made: [] as { id: number; connected: boolean }[],
  contexts: 0,
  current: { env: { DB: {} } } as Ctx,
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
    return ctl.current;
  },
}));

async function load(over: Over) {
  vi.resetModules();
  ctl.over = over;
  ctl.made.length = 0;
  ctl.contexts = 0;
  ctl.current = { env: { DB: {} } };
  // vitest can resolve concurrent first imports of a mocked module to the real one, so import them once here
  await import("@prisma/client");
  await import("@prisma/adapter-d1");
  await import("@opennextjs/cloudflare");
  const { getPrisma } = await import("@/lib/prisma");
  return { getPrisma, made: ctl.made, contexts: () => ctl.contexts };
}

const newRequest = () => {
  ctl.current = { env: { DB: {} } };
};

describe("the lazy database client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("builds one client per request, and never hands one request's client to another", async () => {
    const { getPrisma, made } = await load({});
    const a = await getPrisma();
    expect(await getPrisma()).toBe(a); // the same request asks again
    newRequest();
    const b = await getPrisma();
    expect(b).not.toBe(a);
    expect(made.length).toBe(2);
  });

  it("calls inside one request wait for the client that request is already building", async () => {
    const g = gate();
    const { getPrisma, made } = await load({ contextGate: () => g.promise });
    const first = getPrisma();
    await new Promise((r) => setTimeout(r, 0));
    const second = getPrisma();
    g.open();
    expect(await first).toBe(await second);
    expect(made.length).toBe(1);
  });

  it("hands out a client only after it has been warmed up", async () => {
    const connectGate = gate();
    const { getPrisma, made } = await load({ connect: () => connectGate.promise });
    const first = getPrisma();
    await new Promise((r) => setTimeout(r, 0));
    expect(made.length).toBe(1);
    expect(made[0].connected).toBe(false);
    connectGate.open();
    expect(((await first) as unknown as { connected: boolean }).connected).toBe(true);
  });

  it("does not cache a failure: the next call tries again", async () => {
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
    expect(JSON.parse(String(quiet.mock.calls[0][0]))).toMatchObject({
      level: "error",
      event: "prisma_warmup_failed",
      error: { message: "connect failed" },
    });
    quiet.mockRestore();
  });
});
