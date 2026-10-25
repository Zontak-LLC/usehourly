import { clientIpFrom } from "@/lib/client-ip";
import { bearer, DRILL_FAULTS, drillArmed, drillRequest, sameSecret } from "@/lib/drill";
import { logWarn } from "@/lib/log";
import { getPrisma } from "@/lib/prisma";
import { hitRateLimit } from "@/lib/rate-limit";
import { drillEnv, readDrill, startDrill, stopDrill } from "@/server/drill";

export const dynamic = "force-dynamic";

/**
 * The drill switch (staging only, see `lib/drill.ts`). GET = what is running; POST {"action":"start","fault",
 * "minutes"} or {"action":"stop"}. Not armed (production, or no DRILL_TOKEN) = 404, as if the route did not exist.
 * Every call needs `Authorization: Bearer <DRILL_TOKEN>`; 20 calls per 15 minutes per connection, right or wrong.
 */
const LIMIT = { calls: 20, windowSeconds: 15 * 60 };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const notFound = () => new Response(null, { status: 404 });

async function authorise(req: Request): Promise<Response | null> {
  const env = drillEnv();
  if (!drillArmed(env) || !env.token) return notFound();
  const prisma = await getPrisma();
  const ip = clientIpFrom(req.headers) ?? "unknown";
  const limit = await hitRateLimit(prisma, `drill:ip:${ip}`, LIMIT.calls, LIMIT.windowSeconds);
  if (!limit.allowed) return json({ error: "Too many tries. Wait a few minutes." }, 429);
  const given = bearer(req.headers.get("authorization"));
  if (!given || !(await sameSecret(given, env.token))) {
    logWarn("drill_refused", { ip });
    return json({ error: "Wrong or missing token." }, 401);
  }
  return null;
}

const describe = (drill: Awaited<ReturnType<typeof readDrill>>) =>
  drill
    ? { running: true, fault: drill.fault, until: new Date(drill.until).toISOString() }
    : { running: false, faults: DRILL_FAULTS };

export async function GET(req: Request) {
  const refused = await authorise(req);
  if (refused) return refused;
  return json(describe(await readDrill(await getPrisma())));
}

export async function POST(req: Request) {
  const refused = await authorise(req);
  if (refused) return refused;
  const raw = await req.text();
  if (raw.length > 1000) return json({ error: "Too long." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Send JSON." }, 400);
  }
  const parsed = drillRequest.safeParse(body);
  if (!parsed.success) return json({ error: "Unknown action or fault.", faults: Object.keys(DRILL_FAULTS) }, 400);
  const prisma = await getPrisma();
  if (parsed.data.action === "stop") {
    const was = await stopDrill(prisma);
    return json({ stopped: was?.fault ?? null, ...describe(null) });
  }
  return json(describe(await startDrill(prisma, parsed.data.fault, parsed.data.minutes)));
}
