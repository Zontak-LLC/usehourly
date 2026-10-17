import { getPrisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/reminder-token";

export const dynamic = "force-dynamic";

/**
 * Turns the weekly reminder off for one person. The link carries a signed token, so no sign-in is needed.
 * It only acts on POST: mail programs and link scanners open links with GET, and must not unsubscribe anyone.
 * The footer link goes to a page with a button; the "one-click" mail header posts here directly.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!(await verifyUnsubscribeToken(process.env.AUTH_SECRET ?? "", userId, token))) {
    return new Response(JSON.stringify({ error: "This link isn't valid." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const prisma = await getPrisma();
  await prisma.authUser.updateMany({ where: { id: userId }, data: { weekly_reminder: false } });
  // From the page's button: go back to a confirmation. From a mail program's one-click: a plain 200.
  const form = (await req.formData().catch(() => null))?.get("page");
  if (form) return Response.redirect(new URL("/reminders/off?done=1", url), 303);
  return Response.json({ ok: true });
}

export const GET = () => new Response(null, { status: 405, headers: { allow: "POST" } });
