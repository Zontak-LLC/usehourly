import { getPrisma } from "@/lib/prisma";
import { verifyStopEmailToken } from "@/lib/reminder-token";
import { suppressEmails } from "@/server/invoice-mail";

export const dynamic = "force-dynamic";

/**
 * Stops invoice emails to one address for good, whoever sent them. The link carries a signed token, so no sign-in is
 * needed. It only acts on POST: mail programs and link scanners open links with GET and must not unsubscribe anyone.
 * The footer link goes to a page with a button; the "one-click" mail header posts here directly.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get("e") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!(await verifyStopEmailToken(process.env.AUTH_SECRET ?? "", email, token))) {
    return new Response(JSON.stringify({ error: "This link isn't valid." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  await suppressEmails(await getPrisma(), [email], "asked-to-stop");
  const form = (await req.formData().catch(() => null))?.get("page");
  if (form) return Response.redirect(new URL("/stop-emails?done=1", url), 303);
  return Response.json({ ok: true });
}

export const GET = () => new Response(null, { status: 405, headers: { allow: "POST" } });
