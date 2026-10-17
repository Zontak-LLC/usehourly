/**
 * The key a per-connection limit uses for a client address.
 *
 * An IPv4 address is one connection. An IPv6 customer is handed a whole /64 (2^64 addresses) and can
 * pick any of them per request, so limiting on the raw address limits nothing: every address in the
 * same /64 must share one key. IPv4-mapped IPv6 (::ffff:1.2.3.4) is the IPv4 address it wraps.
 */
const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function expandV6(address: string): number[] | null {
  let text = address;
  // An embedded IPv4 tail (::ffff:1.2.3.4, 64:ff9b::1.2.3.4) is two 16-bit groups.
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail) {
    const m = V4.exec(tail[1]);
    if (!m) return null;
    const [a, b, c, d] = m.slice(1).map(Number);
    if ([a, b, c, d].some((n) => n > 255)) return null;
    text = `${text.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? Number.parseInt(g, 16) : Number.NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

/** Normalized limit key for an address from the edge, or null when there is none. */
export function clientIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase().replace(/%.*$/, "");
  if (!text) return null;
  if (V4.test(text)) return text;
  if (text.includes(":")) {
    const groups = expandV6(text);
    if (groups) {
      // ::ffff:a.b.c.d is IPv4 in disguise.
      if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
        return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
      }
      return `${groups
        .slice(0, 4)
        .map((g) => g.toString(16))
        .join(":")}::/64`;
    }
  }
  return text.slice(0, 64); // something odd: use it as it is, but never as an unbounded key
}

/** The caller's limit key from a request's headers (Cloudflare sets cf-connecting-ip). */
export const clientIpFrom = (headers: Pick<Headers, "get"> | null | undefined): string | null =>
  clientIp(headers?.get("cf-connecting-ip"));
