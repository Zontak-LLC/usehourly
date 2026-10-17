import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { hitRateLimit } from "@/lib/rate-limit";
import { isUsagePage, usageDay } from "@/lib/usage";

/**
 * Counts one view of an in-app page (issue #37). Stores only (day, page, count): no user id, no cookie,
 * no address, nothing the visitor typed. The page must be one of the known ones, so nothing a caller
 * sends can add a row. Signed-out requests and sample accounts are ignored quietly (204), so the counter
 * says nothing about who is signed in and stays about real use.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || session?.user?.demo === true) return new Response(null, { status: 204 });

  const raw = await req.text();
  if (raw.length > 200) return new Response(null, { status: 413 });
  let page: unknown;
  try {
    page = (JSON.parse(raw) as { page?: unknown }).page;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!isUsagePage(page)) return new Response(null, { status: 400 });

  const prisma = await getPrisma();
  // 120 views a minute per account is far above real use; past that the extra views are dropped.
  const limit = await hitRateLimit(prisma, `usage:${userId}`, 120, 60);
  if (!limit.allowed) return new Response(null, { status: 204 });

  const day = usageDay();
  await prisma.usageDaily.upsert({
    where: { day_page: { day, page } },
    create: { day, page, count: 1 },
    update: { count: { increment: 1 } },
  });
  return new Response(null, { status: 204 });
}
