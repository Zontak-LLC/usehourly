/**
 * OAuth 2.1 pieces for the MCP server, free of I/O so each rule can be tested on its own.
 * MCP clients (Claude, Cursor, directories...) register themselves, send the user to a consent
 * screen, and trade a one-time code (with PKCE) for the same `uh_` access token the Account page makes.
 */
import { hashToken } from "@/lib/email-token";

export const CODE_TTL_SECONDS = 5 * 60;
/** How long a token from the OAuth flow lives. Clients simply ask again afterwards. */
export const OAUTH_TOKEN_SECONDS = 90 * 24 * 3600;
export const MAX_REDIRECT_URIS = 10;
export const MAX_CLIENT_NAME = 100;
export const MAX_CLIENTS = 20000;

export type Access = "read" | "write";

// Schemes that open other programs or pages instead of handing a code back to an app. Real MCP clients use
// https, loopback http, or their own scheme (cursor://, vscode://), so everything else below is refused.
const BLOCKED_SCHEMES = new Set([
  "javascript",
  "data",
  "file",
  "vbscript",
  "blob",
  "about",
  "ftp",
  "ws",
  "wss",
  "view-source",
  "search",
  "search-ms",
  "intent",
  "mailto",
  "tel",
  "sms",
  "smsto",
  "ssh",
  "telnet",
  "gopher",
  "jar",
  "chrome",
  "chrome-extension",
  "moz-extension",
  "itms",
  "itms-apps",
  "itms-services",
]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Why a redirect address cannot be used, or null when it can. Native apps may use their own scheme (cursor://, vscode://). */
export function redirectUriProblem(uri: unknown): string | null {
  if (typeof uri !== "string" || uri.length === 0 || uri.length > 500)
    return "A redirect address is missing or too long.";
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return `"${uri.slice(0, 60)}" is not a valid address.`;
  }
  if (u.hash) return "A redirect address must not contain a #fragment.";
  const scheme = u.protocol.slice(0, -1).toLowerCase();
  // ms-* are Windows protocol handlers (ms-msdt, ms-officecmd...): never an OAuth client.
  if (BLOCKED_SCHEMES.has(scheme) || scheme.startsWith("ms-")) return `The "${scheme}" scheme cannot be used.`;
  if (scheme === "https") return u.username || u.password ? "A redirect address must not contain a login." : null;
  if (scheme === "http") return LOOPBACK_HOSTS.has(u.hostname) ? null : "Plain http is allowed only for localhost.";
  return /^[a-z][a-z0-9+.-]{0,39}$/.test(scheme) ? null : "Unsupported redirect scheme.";
}

/**
 * A client's self-declared name as plain, printable text. Control, zero-width and bidirectional
 * override characters are removed (they can reorder or hide letters on the consent screen); the name is
 * still unverified, so the consent screen says so.
 */
export function cleanClientName(raw: unknown): string {
  const text =
    typeof raw === "string"
      ? raw
          // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
          .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "";
  return (text || "MCP client").slice(0, MAX_CLIENT_NAME);
}

export type Registration = { name: string; redirectUris: string[] };

/** Reads a dynamic client registration request (RFC 7591). Public clients only: no client secret is issued. */
export function parseRegistration(
  body: unknown,
): { ok: true; value: Registration } | { ok: false; description: string } {
  if (!body || typeof body !== "object") return { ok: false, description: "Send a JSON object." };
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
    return { ok: false, description: `redirect_uris must be a list of 1 to ${MAX_REDIRECT_URIS} addresses.` };
  }
  for (const uri of uris) {
    const problem = redirectUriProblem(uri);
    if (problem) return { ok: false, description: problem };
  }
  const name = cleanClientName(b.client_name);
  return { ok: true, value: { name, redirectUris: [...new Set(uris as string[])] } };
}

/** Base64url of the SHA-256 of the verifier: what a client sends as `code_challenge` (method S256). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** RFC 7636: a verifier is 43 to 128 characters from a small safe alphabet. */
export const validVerifier = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(v);
export const validChallenge = (c: unknown): c is string => typeof c === "string" && /^[A-Za-z0-9_-]{43}$/.test(c);

export async function verifierMatches(verifier: string, challenge: string): Promise<boolean> {
  return validVerifier(verifier) && (await pkceChallenge(verifier)) === challenge;
}

export const hashCode = hashToken;

/** The scope a client asked for: "write" if it mentions write, else read. The user still chooses on the consent screen. */
export function requestedAccess(scope: string | undefined): Access {
  return (scope ?? "").split(/\s+/).includes("write") ? "write" : "read";
}

/** Adds query parameters to a redirect address, keeping any it already has. */
export function withParams(base: string, params: Record<string, string | undefined>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

/** What to show for where the user is about to be sent: the host for web addresses, the scheme for apps. */
export function redirectLabel(uri: string): string {
  const u = new URL(uri);
  return u.protocol === "https:" || u.protocol === "http:" ? u.host : `${u.protocol}//`;
}

export const mcpResourceUrl = (appUrl: string) => `${appUrl}/api/mcp`;

export function protectedResourceMetadata(appUrl: string) {
  return {
    resource: mcpResourceUrl(appUrl),
    authorization_servers: [appUrl],
    bearer_methods_supported: ["header"],
    scopes_supported: ["read", "write"],
    resource_name: "UseHourly",
    resource_documentation: "https://github.com/Zontak-LLC/usehourly#use-it-from-any-ai-assistant-mcp-server",
  };
}

export function authorizationServerMetadata(appUrl: string) {
  return {
    issuer: appUrl,
    authorization_endpoint: `${appUrl}/oauth/authorize`,
    token_endpoint: `${appUrl}/api/oauth/token`,
    registration_endpoint: `${appUrl}/api/oauth/register`,
    revocation_endpoint: `${appUrl}/api/oauth/revoke`,
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["read", "write"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    // RFC 9207: every answer sent back to the app's redirect address names this server as `iss`, so an app that
    // talks to several servers can tell a mix-up attack from a real answer.
    authorization_response_iss_parameter_supported: true,
    service_documentation: "https://github.com/Zontak-LLC/usehourly",
  };
}

/** The header that tells an MCP client where to start the OAuth flow. */
export const wwwAuthenticate = (appUrl: string) =>
  `Bearer realm="usehourly", resource_metadata="${appUrl}/.well-known/oauth-protected-resource"`;

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version",
  "access-control-max-age": "86400",
} as const;
