/**
 * A fresh, unguessable nonce (base64 of 16 random bytes) for one request's Content-Security-Policy. The policy itself
 * is built by `buildCsp` in `security-policy.mjs`.
 */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
