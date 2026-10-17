import { appUrl, createMailer } from "@/lib/mailer";
import { getPrisma } from "@/lib/prisma";
import { verifyCronToken } from "@/lib/reminder-token";
import { runHousekeeping } from "@/server/housekeeping";
import { runWeeklyReminders } from "@/server/reminders";

export const dynamic = "force-dynamic";

/**
 * Called by the Worker's hourly cron trigger (see custom-worker.ts), never by a person. The request must
 * carry a key derived from the app's own secret; anything else is refused.
 */
export async function POST(req: Request) {
  const secret = process.env.AUTH_SECRET ?? "";
  if (!(await verifyCronToken(secret, req.headers.get("authorization")))) {
    return new Response(JSON.stringify({ error: "Not allowed." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  // Sweep old throttle counters and expired links first: it needs no email service.
  const prisma = await getPrisma();
  const housekeeping = await runHousekeeping(prisma);
  const mailer = createMailer();
  if (!mailer) {
    // Email is not set up: nothing to send, and say so plainly instead of pretending to.
    return Response.json({ skipped: "Email is not set up (RESEND_API_KEY and EMAIL_FROM).", housekeeping });
  }
  const result = await runWeeklyReminders({ prisma, mailer, appUrl: appUrl(), secret });
  return Response.json({ ...result, housekeeping }, { headers: { "cache-control": "no-store" } });
}

export const GET = () => new Response(null, { status: 405, headers: { allow: "POST" } });
