import { appUrl, createMailer } from "@/lib/mailer";
import { getPrisma } from "@/lib/prisma";
import { verifyCronToken } from "@/lib/reminder-token";
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
  const mailer = createMailer();
  if (!mailer) {
    // Email is not set up: nothing to do, and say so plainly instead of pretending.
    return Response.json({ skipped: "Email is not set up (RESEND_API_KEY and EMAIL_FROM)." });
  }
  const result = await runWeeklyReminders({ prisma: await getPrisma(), mailer, appUrl: appUrl(), secret });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}

export const GET = () => new Response(null, { status: 405, headers: { allow: "POST" } });
