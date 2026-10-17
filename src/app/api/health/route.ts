import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * For an uptime monitor: 200 when the app can reach its database, 503 when it cannot. It reveals nothing
 * (no counts, no versions, no error text) and needs no sign-in.
 */
async function check() {
  let ok = false;
  try {
    await (await getPrisma()).$queryRaw`SELECT 1`;
    ok = true;
  } catch (err) {
    console.error("health check failed:", err);
  }
  return Response.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

export const GET = check;
export const HEAD = check;
