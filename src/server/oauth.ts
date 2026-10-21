import type { PrismaClient } from "@prisma/client";

import { hashApiToken, MAX_TOKENS_PER_USER, newApiToken, tokenPrefix } from "@/lib/api-token";
import { newToken } from "@/lib/email-token";
import {
  type Access,
  CODE_TTL_SECONDS,
  cleanClientName,
  hashCode,
  MAX_CLIENTS,
  mcpResourceUrl,
  OAUTH_TOKEN_SECONDS,
  parseRegistration,
  redirectLabel,
  requestedAccess,
  validChallenge,
  verifierMatches,
  withParams,
} from "@/lib/oauth";
import { hitRateLimit } from "@/lib/rate-limit";

export type OAuthError = { error: string; error_description: string; status?: number };
const oauthError = (error: string, error_description: string, status = 400): OAuthError => ({
  error,
  error_description,
  status,
});

const REGISTER_PER_IP = { limit: 20, windowSeconds: 60 * 60 };
const TOKEN_PER_IP = { limit: 60, windowSeconds: 60 };
const APPROVE_PER_USER = { limit: 20, windowSeconds: 60 * 60 };

// ------------------------------------------------------------------ registration

export async function registerClient(prisma: PrismaClient, body: unknown, ip: string | null) {
  if (ip) {
    const hit = await hitRateLimit(
      prisma,
      `oauth-register:${ip}`,
      REGISTER_PER_IP.limit,
      REGISTER_PER_IP.windowSeconds,
    );
    if (!hit.allowed) return oauthError("temporarily_unavailable", "Too many registrations. Try again later.", 429);
  }
  const parsed = parseRegistration(body);
  if (!parsed.ok) return oauthError("invalid_redirect_uri", parsed.description);
  if ((await prisma.oauthClient.count()) >= MAX_CLIENTS) {
    return oauthError("temporarily_unavailable", "Registration is closed for now.", 503);
  }
  const row = await prisma.oauthClient.create({
    data: { name: parsed.value.name, redirect_uris: JSON.stringify(parsed.value.redirectUris) },
  });
  return {
    client_id: row.id,
    client_name: row.name,
    redirect_uris: parsed.value.redirectUris,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}

// ------------------------------------------------------------------ the consent screen

export type AuthorizeParams = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
};

export type AuthorizeCheck =
  | {
      kind: "ok";
      clientId: string;
      clientName: string;
      redirectUri: string;
      redirectHost: string;
      challenge: string;
      state?: string;
      requested: Access;
    }
  | { kind: "fatal"; message: string } // never redirect: the client or its address cannot be trusted
  | { kind: "redirect"; url: string; host: string }; // the address is trusted, so the client is told what was wrong

/** Checks an authorization request. A bad client or redirect address is never redirected to. */
export async function checkAuthorizeRequest(
  prisma: PrismaClient,
  p: AuthorizeParams,
  appUrl: string,
): Promise<AuthorizeCheck> {
  if (!p.client_id || !p.redirect_uri) {
    return { kind: "fatal", message: "This link is missing information. Start again from the app you are connecting." };
  }
  const client = await prisma.oauthClient.findUnique({ where: { id: p.client_id } });
  if (!client)
    return { kind: "fatal", message: "This app is not registered with UseHourly. Start again from the app." };
  const registered = JSON.parse(client.redirect_uris) as string[];
  if (!registered.includes(p.redirect_uri)) {
    return {
      kind: "fatal",
      message: "This app asked to be sent to an address it did not register, so UseHourly stopped.",
    };
  }
  const fail = (error: string, description: string): AuthorizeCheck => ({
    kind: "redirect",
    url: withParams(p.redirect_uri as string, { error, error_description: description, state: p.state }),
    host: redirectLabel(p.redirect_uri as string),
  });
  if (p.response_type !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
  if (p.code_challenge_method !== "S256" || !validChallenge(p.code_challenge)) {
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  if (p.resource && p.resource !== mcpResourceUrl(appUrl)) return fail("invalid_target", "Unknown resource.");
  if (p.state && p.state.length > 500) return fail("invalid_request", "state is too long.");
  return {
    kind: "ok",
    clientId: client.id,
    clientName: cleanClientName(client.name),
    redirectUri: p.redirect_uri,
    redirectHost: redirectLabel(p.redirect_uri),
    challenge: p.code_challenge as string,
    state: p.state,
    requested: requestedAccess(p.scope),
  };
}

/** The user's answer on the consent screen. Returns where to send the browser. */
export async function decideAuthorization(
  prisma: PrismaClient,
  userId: string,
  params: AuthorizeParams,
  decision: { allow: boolean; access: Access },
  appUrl: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ ok: true; redirectUrl: string } | { ok: false; message: string }> {
  const check = await checkAuthorizeRequest(prisma, params, appUrl);
  if (check.kind === "fatal") return { ok: false, message: check.message };
  if (check.kind === "redirect") return { ok: true, redirectUrl: check.url };
  if (!decision.allow) {
    return {
      ok: true,
      redirectUrl: withParams(check.redirectUri, {
        error: "access_denied",
        error_description: "The user said no.",
        state: check.state,
      }),
    };
  }
  const hit = await hitRateLimit(
    prisma,
    `oauth-approve:${userId}`,
    APPROVE_PER_USER.limit,
    APPROVE_PER_USER.windowSeconds,
    nowSeconds,
  );
  if (!hit.allowed) return { ok: false, message: "Too many approvals in a short time. Please wait a while." };

  await prisma.oauthCode.deleteMany({ where: { expires_at: { lt: nowSeconds - 3600 } } }); // housekeeping
  const code = newToken();
  await prisma.oauthCode.create({
    data: {
      code_hash: await hashCode(code),
      client_id: check.clientId,
      user_id: userId,
      redirect_uri: check.redirectUri,
      code_challenge: check.challenge,
      access: decision.access,
      expires_at: nowSeconds + CODE_TTL_SECONDS,
    },
  });
  return { ok: true, redirectUrl: withParams(check.redirectUri, { code, state: check.state }) };
}

// ------------------------------------------------------------------ the token endpoint

export type TokenRequest = {
  grant_type?: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  code_verifier?: string;
};

export async function exchangeCode(
  prisma: PrismaClient,
  req: TokenRequest,
  ip: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (ip) {
    const hit = await hitRateLimit(
      prisma,
      `oauth-token:${ip}`,
      TOKEN_PER_IP.limit,
      TOKEN_PER_IP.windowSeconds,
      nowSeconds,
    );
    if (!hit.allowed) return oauthError("temporarily_unavailable", "Too many requests. Slow down.", 429);
  }
  if (req.grant_type !== "authorization_code") {
    return oauthError("unsupported_grant_type", "Only authorization_code is supported.");
  }
  if (!req.code || !req.redirect_uri || !req.client_id || !req.code_verifier) {
    return oauthError("invalid_request", "code, redirect_uri, client_id and code_verifier are required.");
  }
  const grantFail = () => oauthError("invalid_grant", "The code is invalid, expired or was already used.");

  const row = await prisma.oauthCode.findUnique({
    where: { code_hash: await hashCode(req.code) },
    include: { client: { select: { name: true } } },
  });
  if (!row) return grantFail();

  // A code is good once. Reuse means it leaked, so the token it made is revoked too.
  if (row.used_at !== null) {
    if (row.token_id) {
      await prisma.apiToken.updateMany({
        where: { id: row.token_id, revoked_at: null },
        data: { revoked_at: nowSeconds },
      });
    }
    return grantFail();
  }
  // Claim it first (atomically), so two requests cannot both win and a wrong verifier burns the code.
  const claimed = await prisma.oauthCode.updateMany({
    where: { id: row.id, used_at: null },
    data: { used_at: nowSeconds },
  });
  if (claimed.count !== 1) return grantFail();

  if (row.expires_at <= nowSeconds) return grantFail();
  if (row.client_id !== req.client_id || row.redirect_uri !== req.redirect_uri) return grantFail();
  if (!(await verifierMatches(req.code_verifier, row.code_challenge))) return grantFail();

  const user = await prisma.authUser.findUnique({
    where: { id: row.user_id },
    select: { id: true, token_version: true, is_demo: true },
  });
  if (!user || user.is_demo) return grantFail();

  const name = `${row.client.name} (OAuth)`.slice(0, 60);
  // This app's earlier token: matched by the app's id (two apps can pick the same display name). A token made before
  // the id was kept has none, so it is matched the old way, by name.
  const mine = {
    user_id: user.id,
    revoked_at: null,
    OR: [{ oauth_client_id: row.client_id }, { oauth_client_id: null, name }],
  };
  // The limit is checked BEFORE anything is revoked, counting the earlier token as replaced, so a refusal never costs
  // the person the connection they already had.
  const [live, replaced] = await Promise.all([
    prisma.apiToken.count({ where: { user_id: user.id, revoked_at: null } }),
    prisma.apiToken.count({ where: mine }),
  ]);
  if (live - replaced >= MAX_TOKENS_PER_USER) {
    return oauthError(
      "access_denied",
      "This account has too many active tokens. Revoke one in UseHourly under Account.",
      403,
    );
  }

  const token = newApiToken();
  const created = await prisma.apiToken.create({
    data: {
      user_id: user.id,
      name,
      oauth_client_id: row.client_id,
      token_hash: await hashApiToken(token),
      prefix: tokenPrefix(token),
      access: row.access,
      token_version: user.token_version,
      expires_at: nowSeconds + OAUTH_TOKEN_SECONDS,
    },
    select: { id: true },
  });
  // Connecting the same app again replaces its earlier token instead of piling them up (the new one exists first).
  await prisma.apiToken.updateMany({
    where: { ...mine, id: { not: created.id } },
    data: { revoked_at: nowSeconds },
  });
  await prisma.oauthCode.update({ where: { id: row.id }, data: { token_id: created.id } });
  return { access_token: token, token_type: "Bearer", expires_in: OAUTH_TOKEN_SECONDS, scope: row.access };
}
