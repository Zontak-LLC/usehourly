import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const prismaMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ getPrisma: prismaMock }));

const { GET, HEAD } = await import("@/app/api/health/route");

/**
 * An uptime monitor (Night Watch) reads /api/health every few minutes. These scenarios run the route against a REAL
 * SQLite database with every migration applied, holding a real account's time, and read the answer the way the
 * monitor does.
 */
function realDb() {
  const db = new DatabaseSync(":memory:");
  const dir = path.join(process.cwd(), "migrations");
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  const sent: string[] = [];
  const queryRaw = vi.fn(async (parts: TemplateStringsArray, ...values: (string | number)[]) => {
    const sql = parts.join("?");
    sent.push(sql);
    return db.prepare(sql).all(...values);
  });
  return { db, sent, prisma: { $queryRaw: queryRaw } };
}

function addRealAccountTime(db: DatabaseSync) {
  db.exec(
    `INSERT INTO auth_users (id, email, name, password_hash) VALUES ('cku1realuser', 'pat@example.com', 'Pat', 'x')`,
  );
  db.exec(`INSERT INTO clients (id, user_id, name) VALUES ('ckc1', 'cku1realuser', 'Acme Studio')`);
  db.exec(`INSERT INTO projects (id, user_id, client_id, name) VALUES ('ckp1', 'cku1realuser', 'ckc1', 'Design')`);
  for (let i = 1; i <= 5; i++) {
    db.exec(
      `INSERT INTO time_entries (id, user_id, project_id, date, minutes, note, updated_at) VALUES ('cke${i}', 'cku1realuser', 'ckp1', '2026-10-0${i}', 420, 'Secret client work ${i}', CURRENT_TIMESTAMP)`,
    );
  }
}

let logs: string[];
beforeEach(() => {
  logs = [];
  vi.spyOn(console, "error").mockImplementation((line: string) => {
    logs.push(line);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  prismaMock.mockReset();
});

describe("the health check reports how long the database takes", () => {
  it("answers 200 with ok and two whole-millisecond timings, uncached, and nothing else", async () => {
    const { db, prisma } = realDb();
    addRealAccountTime(db);
    prismaMock.mockResolvedValue(prisma);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { ok: boolean; db: { selectMs: number; probeMs: number } };
    expect(Object.keys(body).sort()).toEqual(["db", "ok"]);
    expect(Object.keys(body.db).sort()).toEqual(["probeMs", "selectMs"]);
    expect(body.ok).toBe(true);
    for (const ms of [body.db.selectMs, body.db.probeMs]) {
      expect(Number.isInteger(ms)).toBe(true);
      expect(ms).toBeGreaterThanOrEqual(0);
    }
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect((await HEAD()).status).toBe(200);
  });

  it("the probe reads no one's data: a real account's entries never change the answer or appear in it", async () => {
    const { db, prisma } = realDb();
    prismaMock.mockResolvedValue(prisma);
    const empty = await (await GET()).text();
    addRealAccountTime(db);
    const full = await (await GET()).text();

    for (const text of [empty, full]) {
      expect(text).not.toMatch(/cku1realuser|pat@example|Acme|Design|Secret|2100|420/);
      expect(text).toMatch(/^\{"ok":true,"db":\{"selectMs":\d+,"probeMs":\d+\}\}$/);
    }
    // The probe asked for an id no account can have, so its own result was empty.
    const probe = prisma.$queryRaw.mock.calls[1] as unknown as [TemplateStringsArray, ...string[]];
    expect(probe.slice(1)).toEqual(["health-probe"]);
    expect(await prisma.$queryRaw.mock.results[1]?.value).toEqual([{ n: 0, m: 0 }]);
  });

  it("the probe is a realistic read: SQLite answers it from the covering index, never the table", async () => {
    const { db, sent, prisma } = realDb();
    prismaMock.mockResolvedValue(prisma);
    await GET();
    const probeSql = sent[1] ?? "";
    expect(probeSql).toMatch(/FROM time_entries/);
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${probeSql}`).all("health-probe") as { detail: string }[];
    expect(plan.map((p) => p.detail).join(" | ")).toMatch(/USING COVERING INDEX/);
  });

  it("still answers 503 with only { ok: false } when the database fails, and logs it", async () => {
    prismaMock.mockResolvedValue({
      $queryRaw: vi.fn(async () => {
        throw new Error("D1_ERROR: network connection lost (secret detail)");
      }),
    });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe('{"ok":false}');
    expect(logs.some((l) => l.includes('"event":"health_check_failed"'))).toBe(true);
  });

  it("answers 503 when SELECT 1 works but the indexed read fails", async () => {
    let n = 0;
    prismaMock.mockResolvedValue({
      $queryRaw: vi.fn(async () => {
        n += 1;
        if (n === 2) throw new Error("D1_ERROR: no such table");
        return [{ 1: 1 }];
      }),
    });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("answers 503 when the database cannot even be opened", async () => {
    prismaMock.mockRejectedValue(new Error("binding DB missing"));
    expect((await GET()).status).toBe(503);
  });
});
