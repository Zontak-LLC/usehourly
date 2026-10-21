import { describe, expect, it, vi } from "vitest";

import { hashApiToken, MAX_TOKENS_PER_USER } from "@/lib/api-token";
import {
  authorizationServerMetadata,
  CODE_TTL_SECONDS,
  OAUTH_TOKEN_SECONDS,
  pkceChallenge,
  protectedResourceMetadata,
  redirectUriProblem,
  wwwAuthenticate,
} from "@/lib/oauth";
import { safeNext } from "@/lib/safe-next";
import { handleMcpHttp } from "@/server/mcp/http";
import { checkAuthorizeRequest, decideAuthorization, exchangeCode, registerClient } from "@/server/oauth";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

const APP = "https://usehourly.app";
const VERIFIER = "a-long-random-verifier-0123456789-abcdefghijklmnopqrstuvwxyz";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

type Row = Record<string, unknown> & { id: string };
type Data = Record<string, unknown>;

/** Stateful stand-in for the tables the OAuth flow touches, so a whole sign-in can be run and replayed. */
function fakeDb(userOver: Partial<{ is_demo: boolean; token_version: number }> = {}) {
  const clients: Row[] = [];
  const codes: Row[] = [];
  const tokens: Row[] = [];
  const user = { id: "u1", token_version: 2, is_demo: false, ...userOver };
  const limiter = memoryRateLimit();
  let n = 0;
  const match = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === "OR") return (v as Record<string, unknown>[]).some((w) => match(row, w));
      if (v && typeof v === "object" && "lt" in (v as object)) return (row[k] as number) < (v as { lt: number }).lt;
      if (v && typeof v === "object" && "not" in (v as object)) return row[k] !== (v as { not: unknown }).not;
      return row[k] === v;
    });
  const prisma = {
    rateLimit: limiter.rateLimit,
    authUser: { findUnique: vi.fn(async () => ({ ...user, email: "jo@example.com" })) },
    oauthClient: {
      count: vi.fn(async () => clients.length),
      create: vi.fn(async ({ data }: { data: Data }) => {
        const row = { id: `client-${++n}`, ...data } as Row;
        clients.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => clients.find((c) => c.id === where.id) ?? null),
    },
    oauthCode: {
      create: vi.fn(async ({ data }: { data: Data }) => {
        const row = { id: `code-${++n}`, used_at: null, token_id: null, ...data } as Row;
        codes.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { code_hash: string } }) => {
        const found = codes.find((c) => c.code_hash === where.code_hash);
        if (!found) return null;
        const row = { ...found }; // a snapshot, taken before the pause below
        await new Promise((r) => setTimeout(r, 5)); // a slow read: concurrent requests all see the code unused
        const client = clients.find((c) => c.id === row.client_id);
        return { ...row, client: { name: client?.name } };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Data }) => {
        const hit = codes.filter((c) => match(c, where));
        for (const c of hit) Object.assign(c, data);
        return { count: hit.length };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Data }) => {
        Object.assign(codes.find((c) => c.id === where.id) as Row, data);
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    apiToken: {
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Data }) => {
        const hit = tokens.filter((t) => match(t, where));
        for (const t of hit) Object.assign(t, data);
        return { count: hit.length };
      }),
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) => tokens.filter((t) => match(t, where)).length,
      ),
      create: vi.fn(async ({ data }: { data: Data }) => {
        const row = { id: `tok-${++n}`, revoked_at: null, last_used_at: null, ...data } as Row;
        tokens.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { token_hash: string } }) => {
        const t = tokens.find((x) => x.token_hash === where.token_hash);
        return t ? { ...t, user: { id: user.id, token_version: user.token_version } } : null;
      }),
      update: vi.fn(async () => ({})),
    },
  };
  return { prisma: prisma as never, raw: prisma, clients, codes, tokens, user };
}

async function register(db: ReturnType<typeof fakeDb>, redirect = REDIRECT, name = "Claude") {
  const res = await registerClient(db.prisma, { client_name: name, redirect_uris: [redirect] }, "1.1.1.1");
  if ("error" in res) throw new Error(res.error_description);
  return res.client_id;
}

const authorizeParams = async (clientId: string, over: Record<string, string | undefined> = {}) => ({
  response_type: "code",
  client_id: clientId,
  redirect_uri: REDIRECT,
  code_challenge: await pkceChallenge(VERIFIER),
  code_challenge_method: "S256",
  state: "xyz",
  ...over,
});

/** Approve on the consent screen and return the code the client receives. */
async function approve(
  db: ReturnType<typeof fakeDb>,
  clientId: string,
  access: "read" | "write" = "write",
  now?: number,
) {
  const res = await decideAuthorization(
    db.prisma,
    "u1",
    await authorizeParams(clientId),
    { allow: true, access },
    APP,
    now,
  );
  if (!res.ok) throw new Error(res.message);
  const url = new URL(res.redirectUrl);
  return { code: url.searchParams.get("code") as string, url };
}

const tokenRequest = (clientId: string, code: string, over: Record<string, string | undefined> = {}) => ({
  grant_type: "authorization_code",
  code,
  client_id: clientId,
  redirect_uri: REDIRECT,
  code_verifier: VERIFIER,
  ...over,
});

describe("how a client finds the OAuth endpoints", () => {
  it("points the 401 at the resource metadata, and the metadata at working endpoints", () => {
    expect(wwwAuthenticate(APP)).toBe(
      'Bearer realm="usehourly", resource_metadata="https://usehourly.app/.well-known/oauth-protected-resource"',
    );
    expect(protectedResourceMetadata(APP)).toMatchObject({
      resource: "https://usehourly.app/api/mcp",
      authorization_servers: [APP],
    });
    expect(authorizationServerMetadata(APP)).toMatchObject({
      authorization_endpoint: `${APP}/oauth/authorize`,
      token_endpoint: `${APP}/api/oauth/token`,
      registration_endpoint: `${APP}/api/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  it("the MCP endpoint's 401 carries that challenge", async () => {
    const db = fakeDb();
    const res = await handleMcpHttp(
      new Request(`${APP}/api/mcp`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } }),
      db.prisma,
      APP,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata=");
  });
});

describe("registering a client", () => {
  it("accepts https, localhost and native-app addresses, and refuses dangerous ones", () => {
    for (const ok of [
      REDIRECT,
      "http://localhost:6274/callback",
      "http://127.0.0.1:9/cb",
      "cursor://anysphere.cursor-retrieval/oauth/user-mcp/callback",
    ]) {
      expect(redirectUriProblem(ok)).toBeNull();
    }
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,x",
      "http://evil.example/cb",
      "https://u:p@a.com/cb",
      "https://a.com/cb#frag",
      "not a url",
      "",
    ]) {
      expect(redirectUriProblem(bad)).not.toBeNull();
    }
  });

  it("stores the client, issues a public client id (no secret), and cleans up the name", async () => {
    const db = fakeDb();
    const res = await registerClient(
      db.prisma,
      { client_name: "  Evil\u0000 <b>App</b> ", redirect_uris: [REDIRECT, REDIRECT] },
      "1.1.1.1",
    );
    expect(res).toMatchObject({
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      redirect_uris: [REDIRECT],
    });
    expect(JSON.stringify(res)).not.toContain("secret");
    expect(db.clients[0].name).toBe("Evil <b>App</b>");
  });

  it("refuses a bad body and creates nothing; limits registrations per connection", async () => {
    const db = fakeDb();
    expect(await registerClient(db.prisma, { redirect_uris: ["javascript:x"] }, "1.1.1.1")).toMatchObject({
      error: "invalid_redirect_uri",
    });
    expect(await registerClient(db.prisma, { redirect_uris: [] }, "1.1.1.1")).toMatchObject({
      error: "invalid_redirect_uri",
    });
    expect(await registerClient(db.prisma, "nope", "1.1.1.1")).toMatchObject({ error: "invalid_redirect_uri" });
    expect(db.raw.oauthClient.create).not.toHaveBeenCalled();
    for (let i = 0; i < 20; i++) await registerClient(db.prisma, { redirect_uris: [REDIRECT] }, "2.2.2.2");
    expect(await registerClient(db.prisma, { redirect_uris: [REDIRECT] }, "2.2.2.2")).toMatchObject({
      error: "temporarily_unavailable",
      status: 429,
    });
  });
});

describe("the consent screen's checks", () => {
  it("never redirects to an address the client did not register, or for an unknown client", async () => {
    const db = fakeDb();
    const id = await register(db);
    expect(
      await checkAuthorizeRequest(
        db.prisma,
        await authorizeParams(id, { redirect_uri: "https://evil.example/cb" }),
        APP,
      ),
    ).toMatchObject({ kind: "fatal" });
    expect(await checkAuthorizeRequest(db.prisma, await authorizeParams("nope"), APP)).toMatchObject({ kind: "fatal" });
    expect(await checkAuthorizeRequest(db.prisma, { client_id: id }, APP)).toMatchObject({ kind: "fatal" });
  });

  it("requires PKCE S256 and the right resource, telling a trusted client what was wrong", async () => {
    const db = fakeDb();
    const id = await register(db);
    for (const over of [
      { code_challenge_method: "plain" },
      { code_challenge: "short" },
      { response_type: "token" },
      { resource: "https://other.example/mcp" },
    ]) {
      const r = await checkAuthorizeRequest(db.prisma, await authorizeParams(id, over), APP);
      expect(r.kind).toBe("redirect");
      if (r.kind === "redirect") {
        expect(r.url.startsWith(REDIRECT)).toBe(true);
        expect(new URL(r.url).searchParams.get("error")).toBeTruthy();
        expect(new URL(r.url).searchParams.get("state")).toBe("xyz");
      }
    }
    const ok = await checkAuthorizeRequest(
      db.prisma,
      await authorizeParams(id, { resource: `${APP}/api/mcp`, scope: "write" }),
      APP,
    );
    expect(ok).toMatchObject({ kind: "ok", clientName: "Claude", redirectHost: "claude.ai", requested: "write" });
  });

  it("says no politely: Cancel sends the client access_denied and makes no code", async () => {
    const db = fakeDb();
    const id = await register(db);
    const res = await decideAuthorization(
      db.prisma,
      "u1",
      await authorizeParams(id),
      { allow: false, access: "read" },
      APP,
    );
    expect(res.ok && new URL(res.redirectUrl).searchParams.get("error")).toBe("access_denied");
    expect(db.codes).toHaveLength(0);
  });
});

describe("a whole connection, start to finish", () => {
  it("registers, is approved, trades the code, and the new token works on the MCP endpoint with the chosen access", async () => {
    const db = fakeDb();
    const id = await register(db);
    const { code, url } = await approve(db, id, "read");
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(db.codes[0].code_hash).not.toBe(code); // only a hash is stored

    const now = Math.floor(Date.now() / 1000);
    const res = await exchangeCode(db.prisma, tokenRequest(id, code), "3.3.3.3", now);
    expect(res).toMatchObject({ token_type: "Bearer", expires_in: OAUTH_TOKEN_SECONDS, scope: "read" });
    const accessToken = (res as { access_token: string }).access_token;
    expect(accessToken.startsWith("uh_")).toBe(true);
    expect(db.tokens[0]).toMatchObject({
      name: "Claude (OAuth)",
      access: "read",
      user_id: "u1",
      token_version: 2,
      expires_at: now + OAUTH_TOKEN_SECONDS,
      token_hash: await hashApiToken(accessToken),
    });
    expect(db.codes[0].token_id).toBe(db.tokens[0].id);

    const call = (method: string, params?: unknown) =>
      handleMcpHttp(
        new Request(`${APP}/api/mcp`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        }),
        db.prisma,
        APP,
      );
    const list = await call("tools/list");
    expect(list.status).toBe(200);
    // A read-only grant is refused for a change, before any data is touched.
    const write = (await (await call("tools/call", { name: "delete_entry", arguments: { id: "x" } })).json()) as {
      result: { isError: boolean; content: { text: string }[] };
    };
    expect(write.result.isError).toBe(true);
    expect(write.result.content[0].text.toLowerCase()).toContain("read");
  });

  it("connecting the same app again replaces its earlier token", async () => {
    const db = fakeDb();
    const id = await register(db);
    await exchangeCode(db.prisma, tokenRequest(id, (await approve(db, id)).code), null);
    await exchangeCode(db.prisma, tokenRequest(id, (await approve(db, id)).code), null);
    expect(db.tokens.filter((t) => t.revoked_at === null)).toHaveLength(1);
    expect(db.tokens).toHaveLength(2);
    expect(db.tokens.every((t) => t.oauth_client_id === id)).toBe(true);
  });

  it("two different apps with the same display name do not replace each other's token", async () => {
    const db = fakeDb();
    const first = await register(db, REDIRECT, "Claude");
    const second = await register(db, "https://impostor.example/cb", "Claude");
    await exchangeCode(db.prisma, tokenRequest(first, (await approve(db, first)).code), null);
    const res = await decideAuthorization(
      db.prisma,
      "u1",
      await authorizeParams(second, { redirect_uri: "https://impostor.example/cb" }),
      { allow: true, access: "write" },
      APP,
    );
    if (!res.ok) throw new Error(res.message);
    const code = new URL(res.redirectUrl).searchParams.get("code") as string;
    await exchangeCode(db.prisma, tokenRequest(second, code, { redirect_uri: "https://impostor.example/cb" }), null);
    // both are alive: connecting the second app did not revoke the first app's token
    expect(db.tokens.filter((t) => t.revoked_at === null)).toHaveLength(2);
  });

  it("a token made before the app id was kept is still replaced by name", async () => {
    const db = fakeDb();
    const id = await register(db);
    db.tokens.push({ id: "old", user_id: "u1", name: "Claude (OAuth)", oauth_client_id: null, revoked_at: null });
    await exchangeCode(db.prisma, tokenRequest(id, (await approve(db, id)).code), null);
    expect(db.tokens.find((t) => t.id === "old")?.revoked_at).not.toBeNull();
    expect(db.tokens.filter((t) => t.revoked_at === null)).toHaveLength(1);
  });
});

describe("what the token endpoint refuses", () => {
  it("a wrong verifier, wrong client, wrong redirect or expired code, and each failed try burns the code", async () => {
    const db = fakeDb();
    const id = await register(db);
    const other = await register(db, "https://cursor.example/cb", "Other");
    const now = Math.floor(Date.now() / 1000);

    for (const over of [
      { code_verifier: `${VERIFIER}-wrong` },
      { client_id: other },
      { redirect_uri: "https://claude.ai/other" },
    ]) {
      const { code } = await approve(db, id, "write", now);
      expect(await exchangeCode(db.prisma, tokenRequest(id, code, over), null, now)).toMatchObject({
        error: "invalid_grant",
      });
      // the right request afterwards still fails: the code was burned by the bad attempt
      expect(await exchangeCode(db.prisma, tokenRequest(id, code), null, now)).toMatchObject({
        error: "invalid_grant",
      });
    }
    const late = await approve(db, id, "write", now);
    expect(await exchangeCode(db.prisma, tokenRequest(id, late.code), null, now + CODE_TTL_SECONDS + 1)).toMatchObject({
      error: "invalid_grant",
    });
    expect(db.tokens).toHaveLength(0);
  });

  it("a code used twice: the second try fails and the token it made is revoked", async () => {
    const db = fakeDb();
    const id = await register(db);
    const { code } = await approve(db, id);
    const first = await exchangeCode(db.prisma, tokenRequest(id, code), null);
    expect(first).toHaveProperty("access_token");
    expect(db.tokens[0].revoked_at).toBeNull();
    expect(await exchangeCode(db.prisma, tokenRequest(id, code), null)).toMatchObject({ error: "invalid_grant" });
    expect(db.tokens[0].revoked_at).not.toBeNull();
  });

  it("two requests at once cannot both win", async () => {
    const db = fakeDb();
    const id = await register(db);
    const { code } = await approve(db, id);
    const results = await Promise.all([
      exchangeCode(db.prisma, tokenRequest(id, code), null),
      exchangeCode(db.prisma, tokenRequest(id, code), null),
    ]);
    expect(results.filter((r) => "access_token" in r)).toHaveLength(1);
  });

  it("junk grants, missing fields, demo accounts and accounts at their token limit", async () => {
    const db = fakeDb();
    const id = await register(db);
    expect(await exchangeCode(db.prisma, { grant_type: "password" }, null)).toMatchObject({
      error: "unsupported_grant_type",
    });
    expect(await exchangeCode(db.prisma, { grant_type: "authorization_code", code: "x" }, null)).toMatchObject({
      error: "invalid_request",
    });
    expect(await exchangeCode(db.prisma, tokenRequest(id, "not-a-real-code"), null)).toMatchObject({
      error: "invalid_grant",
    });

    const demo = fakeDb({ is_demo: true });
    const demoId = await register(demo);
    const { code } = await approve(demo, demoId);
    expect(await exchangeCode(demo.prisma, tokenRequest(demoId, code), null)).toMatchObject({ error: "invalid_grant" });
    expect(demo.tokens).toHaveLength(0);

    const full = fakeDb();
    const fullId = await register(full);
    for (let i = 0; i < MAX_TOKENS_PER_USER; i++)
      full.tokens.push({ id: `t${i}`, user_id: "u1", name: `other ${i}`, revoked_at: null });
    const again = await approve(full, fullId);
    expect(await exchangeCode(full.prisma, tokenRequest(fullId, again.code), null)).toMatchObject({
      error: "access_denied",
      status: 403,
    });
  });

  it("when the account is full, a refusal does not revoke the app's token it already had", async () => {
    const db = fakeDb();
    const id = await register(db);
    await exchangeCode(db.prisma, tokenRequest(id, (await approve(db, id)).code), null);
    // fill the account up to the limit with other tokens (the app's own token is one of the 20)
    for (let i = 0; i < MAX_TOKENS_PER_USER - 1; i++)
      db.tokens.push({ id: `x${i}`, user_id: "u1", name: `other ${i}`, oauth_client_id: null, revoked_at: null });
    // one more by hand, so replacing the app's token would still leave the account over the limit
    db.tokens.push({ id: "extra", user_id: "u1", name: "extra", oauth_client_id: null, revoked_at: null });
    const mine = db.tokens.find((t) => t.oauth_client_id === id);
    const refused = await exchangeCode(db.prisma, tokenRequest(id, (await approve(db, id)).code), null);
    expect(refused).toMatchObject({ error: "access_denied", status: 403 });
    expect(mine?.revoked_at).toBeNull(); // the connection they had is untouched
  });

  it("limits requests per connection", async () => {
    const db = fakeDb();
    for (let i = 0; i < 60; i++) await exchangeCode(db.prisma, { grant_type: "authorization_code" }, "4.4.4.4");
    expect(await exchangeCode(db.prisma, { grant_type: "authorization_code" }, "4.4.4.4")).toMatchObject({
      error: "temporarily_unavailable",
      status: 429,
    });
  });
});

describe("limits on approving", () => {
  it("stops a user from approving more than 20 connections an hour", async () => {
    const db = fakeDb();
    const id = await register(db);
    for (let i = 0; i < 20; i++)
      expect(
        (await decideAuthorization(db.prisma, "u1", await authorizeParams(id), { allow: true, access: "read" }, APP))
          .ok,
      ).toBe(true);
    expect(
      await decideAuthorization(db.prisma, "u1", await authorizeParams(id), { allow: true, access: "read" }, APP),
    ).toMatchObject({ ok: false });
  });
});

describe("going back to where you were after logging in", () => {
  it("allows paths on this site only", () => {
    expect(safeNext("/oauth/authorize?client_id=1&state=a")).toBe("/oauth/authorize?client_id=1&state=a");
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ]) {
      expect(safeNext(bad as string)).toBe("/dashboard/today");
    }
  });
});
