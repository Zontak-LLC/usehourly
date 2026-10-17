import { getPrisma } from "@/lib/prisma";
import { addressesToSuppress, verifySvix } from "@/lib/resend-webhook";
import { suppressEmails } from "@/server/invoice-mail";

/**
 * Resend calls this when a message bounces for good or is reported as spam. We note it on the account
 * and stop the Friday reminder, so a dead address is not mailed again (which hurts the sending reputation
 * that the confirmation and reset emails depend on). Dormant (404) until RESEND_WEBHOOK_SECRET is set.
 * Sign-in and password reset still work: only the optional reminder stops.
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response(null, { status: 404 });
  const body = await req.text();
  if (body.length > 64_000) return new Response(null, { status: 413 });
  const ok = await verifySvix({
    secret,
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
    body,
  });
  if (!ok) return new Response(null, { status: 401 });
  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  const emails = addressesToSuppress(event);
  if (emails.length > 0) {
    const prisma = await getPrisma();
    // Any address that bounced for good or complained, a client's included, is never mailed again.
    await suppressEmails(prisma, emails, "bounced-or-complained");
    await prisma.authUser.updateMany({
      where: { email: { in: emails }, email_bounced_at: null },
      data: { email_bounced_at: new Date(), weekly_reminder: false },
    });
  }
  return new Response(null, { status: 204 });
}
