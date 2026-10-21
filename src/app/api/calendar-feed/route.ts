import { auth } from "@/lib/auth";
import { MAX_LINK_CHARS } from "@/lib/calendar-link";
import { clientIpFrom } from "@/lib/client-ip";
import { getPrisma } from "@/lib/prisma";
import { hitRateLimit } from "@/lib/rate-limit";
import { sessionStillValid } from "@/lib/session-version";
import { fetchCalendarFeed } from "@/server/calendar-feed";

/**
 * Reads a person's private calendar address for their browser (issue #99, slice 2). Stateless: the address comes in the
 * request, the calendar text goes back, and nothing is stored or logged (the address is a secret). Signed-in real
 * accounts only, 30 reads an hour each. The fetch rules (known calendar hosts only, https, size and time limits) are in
 * `server/calendar-feed.ts`.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return json({ error: "Sign in again to use your calendar." }, 401);
  if (session?.user?.demo === true) return json({ error: "Sample accounts can't connect a calendar." }, 403);

  const prisma = await getPrisma();
  // A token from before a password change or "log out everywhere" is no longer a session.
  const account = await prisma.authUser.findUnique({ where: { id: userId }, select: { token_version: true } });
  if (!sessionStillValid(session?.user?.tv, account?.token_version)) {
    return json({ error: "Sign in again to use your calendar." }, 401);
  }

  const raw = await req.text();
  if (raw.length > MAX_LINK_CHARS + 100) return json({ error: "That address is too long." }, 413);
  let link: unknown;
  try {
    link = (JSON.parse(raw) as { url?: unknown }).url;
  } catch {
    return json({ error: "Send the calendar address." }, 400);
  }
  if (typeof link !== "string") return json({ error: "Send the calendar address." }, 400);

  const mine = await hitRateLimit(prisma, `calfeed:u:${userId}`, 30, 3600);
  const ip = clientIpFrom(req.headers);
  const theirs = ip ? await hitRateLimit(prisma, `calfeed:ip:${ip}`, 120, 3600) : { allowed: true as const };
  if (!mine.allowed || !theirs.allowed) {
    return json({ error: "That's a lot of calendar reads. Try again in a little while." }, 429);
  }

  const result = await fetchCalendarFeed(link);
  if (!result.ok) return json({ error: result.message }, result.status);
  return new Response(result.text, {
    status: 200,
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" },
  });
}

const json = (body: { error: string }, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
